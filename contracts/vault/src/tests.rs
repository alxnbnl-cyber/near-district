//! Contract execution tests using near-sdk's mocked VM. Cross-contract results are injected
//! as promise results, exactly as the runtime delivers them to callbacks.
//! Integration against real RHEA runs separately on testnet/mainnet (docs/operations).
use super::*;
use crate::lending::mul_div;
use crate::merkle::{leaf_hash, node_hash};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const DAY: u64 = 86_400 * 1_000_000_000;
const E12: u128 = 1_000_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn vault_id() -> AccountId {
    acc("vault.near")
}
fn owner() -> AccountId {
    acc("owner.near")
}
fn operator() -> AccountId {
    acc("operator.near")
}
fn guardian() -> AccountId {
    acc("guardian.near")
}
fn token() -> AccountId {
    acc("usdc.near")
}
fn lending() -> AccountId {
    acc("lending.near")
}
fn sponsor() -> AccountId {
    acc("sponsor.near")
}

struct Env {
    ts: u64,
    height: u64,
}

impl Env {
    fn ctx(&self, who: &AccountId, deposit: u128) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(vault_id())
            .predecessor_account_id(who.clone())
            .signer_account_id(who.clone())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .prepaid_gas(Gas::from_tgas(300))
            .block_timestamp(self.ts)
            .block_height(self.height)
            .account_balance(NearToken::from_near(100))
            .random_seed([7u8; 32]);
        b
    }
    fn call(&self, who: &AccountId, deposit: u128) {
        testing_env!(self.ctx(who, deposit).build());
    }
    fn callback(&self, results: Vec<PromiseResult>) {
        testing_env!(
            self.ctx(&vault_id(), 0).build(),
            test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            results
        );
    }
    fn advance(&mut self, ns: u64, blocks: u64) {
        self.ts += ns;
        self.height += blocks;
    }
}

fn ok_json(s: &str) -> PromiseResult {
    PromiseResult::Successful(s.as_bytes().to_vec())
}

fn asset_json(shares: u128, balance: u128, borrowed: u128) -> String {
    format!(
        r#"{{"supplied":{{"shares":"{}","balance":"{}"}},"borrowed":{{"shares":"0","balance":"{}"}},"config":{{"extra_decimals":12,"can_withdraw":true,"can_deposit":true,"reserve_ratio":2500}},"supply_apr":"0.05"}}"#,
        shares, balance, borrowed
    )
}

fn account_json(shares: u128) -> String {
    format!(r#"{{"account_id":"vault.near","supplied":[{{"token_id":"usdc.near","balance":"0","shares":"{}","apr":"0"}}],"collateral":[],"borrowed":[]}}"#, shares)
}

fn setup() -> (Vault, Env) {
    let e = Env { ts: 1_000 * DAY, height: 100 };
    e.call(&owner(), 0);
    let v = Vault::new(
        owner(),
        operator(),
        guardian(),
        token(),
        lending(),
        12,
        1_000, // 10% fee on realized yield
        acc("treasury.near"),
        50, // 0.5% safety buffer
        U64(24 * 3600 * 1_000_000_000),
        U64(MIN_UPGRADE_TIMELOCK_NS),
    );
    (v, e)
}

fn create(v: &mut Vault, e: &Env, cap: u128, sponsor_finalize: bool, random: bool) -> U64 {
    e.call(&sponsor(), 10u128.pow(23));
    v.create_campaign(U128(cap), sponsor_finalize, random)
}

fn fund(v: &mut Vault, e: &Env, id: U64, amount: u128, bonus: bool) {
    e.call(&token(), 0);
    let action = if bonus { "fund_bonus" } else { "fund_principal" };
    let _ = v.ft_on_transfer(sponsor(), U128(amount), format!(r#"{{"action":"{}","campaign_id":"{}"}}"#, action, id.0));
}

fn assert_invariants(v: &Vault) {
    let r = v.check_invariants(None);
    assert!(r.ok, "invariants broken: liquid {} vs {}, shares {} vs {}", r.liquid_sum.0, r.liquid_tracked.0, r.shares_sum.0, r.total_rhea_shares.0);
}

/// Pool state: price 1.1 internal units per share.
const POOL_SHARES: u128 = 1_000_000 * 1_000_000 * E12;
const POOL_BALANCE: u128 = 1_100_000 * 1_000_000 * E12;

/// Funds 1,000 USDC principal and supplies it. Returns minted shares.
fn supplied_campaign(v: &mut Vault, e: &mut Env) -> (U64, u128) {
    let id = create(v, e, 100_000_000, false, false);
    fund(v, e, id, 1_000_000_000, false);
    e.call(&operator(), 0);
    let _ = v.supply(id, U128(1_000_000_000));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![ok_json(r#""1000000000""#)]);
    let _ = v.on_supply_transferred(op, Ok(U128(1_000_000_000)));
    let minted = mul_div(1_000_000_000 * E12, POOL_SHARES, POOL_BALANCE);
    e.callback(vec![ok_json(&account_json(minted)), ok_json(&asset_json(POOL_SHARES, POOL_BALANCE, 0))]);
    assert!(v.on_measured(
        op,
        Ok(Some(near_sdk::serde_json::from_str(&account_json(minted)).unwrap())),
        Ok(Some(near_sdk::serde_json::from_str(&asset_json(POOL_SHARES, POOL_BALANCE, 0)).unwrap()))
    ));
    e.advance(1_000, 1);
    (id, minted)
}

// --------------------------------------------------------------------------- funding

#[test]
fn funding_only_accepts_allowlisted_token_from_sponsor() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 500, false);
    fund(&mut v, &e, id, 200, true);
    let c = v.get_campaign(id).unwrap();
    assert_eq!(c.principal_idle.0, 500);
    assert_eq!(c.bonus_available.0, 200);
    assert_eq!(c.yield_available.0, 0, "bonus must never be booked as yield");
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_TOKEN_NOT_ALLOWED")]
fn rejects_other_tokens() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    e.call(&acc("fake-usdc.near"), 0);
    let _ = v.ft_on_transfer(sponsor(), U128(1), format!(r#"{{"action":"fund_principal","campaign_id":"{}"}}"#, id.0));
}

#[test]
#[should_panic(expected = "ERR_ONLY_SPONSOR_CAN_FUND")]
fn rejects_funding_from_non_sponsor() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    e.call(&token(), 0);
    let _ = v.ft_on_transfer(acc("mallory.near"), U128(1), format!(r#"{{"action":"fund_principal","campaign_id":"{}"}}"#, id.0));
}

#[test]
#[should_panic(expected = "ERR_PAUSED")]
fn paused_vault_rejects_deposits() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    e.call(&guardian(), 0);
    v.pause(false);
    fund(&mut v, &e, id, 1, false);
}

#[test]
#[should_panic(expected = "ERR_STORAGE_DEPOSIT_REQUIRED")]
fn campaign_creation_requires_storage_deposit() {
    let (mut v, e) = setup();
    e.call(&sponsor(), 0);
    v.create_campaign(U128(0), false, false);
}

// --------------------------------------------------------------------------- supply

#[test]
fn supply_credits_measured_shares() {
    let (mut v, mut e) = setup();
    let (id, minted) = supplied_campaign(&mut v, &mut e);
    let c = v.get_campaign(id).unwrap();
    assert_eq!(c.principal_supplied.0, 1_000_000_000);
    assert_eq!(c.principal_idle.0, 0);
    assert_eq!(c.rhea_shares.0, minted);
    assert!(v.pending_op.is_none());
    assert_invariants(&v);
}

#[test]
fn supply_partial_refund_restores_idle_principal() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    e.call(&operator(), 0);
    let _ = v.supply(id, U128(1_000));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![ok_json(r#""0""#)]);
    let _ = v.on_supply_transferred(op, Ok(U128(0)));
    assert_eq!(v.get_campaign(id).unwrap().principal_idle.0, 1_000);
    e.callback(vec![ok_json(&account_json(0)), ok_json(&asset_json(POOL_SHARES, POOL_BALANCE, 0))]);
    assert!(!v.on_measured(
        op,
        Ok(Some(near_sdk::serde_json::from_str(&account_json(0)).unwrap())),
        Ok(Some(near_sdk::serde_json::from_str(&asset_json(POOL_SHARES, POOL_BALANCE, 0)).unwrap()))
    ));
    assert!(v.pending_op.is_none());
    assert_invariants(&v);
}

#[test]
fn supply_transfer_failure_moves_nothing() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    e.call(&operator(), 0);
    let _ = v.supply(id, U128(1_000));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![PromiseResult::Failed]);
    let _ = v.on_supply_transferred(op, Err(near_sdk::PromiseError::Failed));
    assert_eq!(v.get_campaign(id).unwrap().principal_idle.0, 1_000);
    assert_invariants(&v);
}

#[test]
fn supply_share_mismatch_is_flagged_and_pauses() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000_000_000, false);
    e.call(&operator(), 0);
    let _ = v.supply(id, U128(1_000_000_000));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![ok_json(r#""1000000000""#)]);
    let _ = v.on_supply_transferred(op, Ok(U128(1_000_000_000)));
    // RHEA reports far fewer shares than the amount implies
    e.callback(vec![]);
    assert!(!v.on_measured(
        op,
        Ok(Some(near_sdk::serde_json::from_str(&account_json(5)).unwrap())),
        Ok(Some(near_sdk::serde_json::from_str(&asset_json(POOL_SHARES, POOL_BALANCE, 0)).unwrap()))
    ));
    assert!(v.pending_op.is_some(), "lock must be held for investigation");
    assert!(v.pause.inflows);
    assert_eq!(v.get_campaign(id).unwrap().rhea_shares.0, 0);
}

#[test]
#[should_panic(expected = "ERR_OPERATION_IN_PROGRESS")]
fn rhea_operations_are_serialized() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 2_000, false);
    e.call(&operator(), 0);
    let _ = v.supply(id, U128(1_000));
    let _ = v.supply(id, U128(1_000));
}

#[test]
#[should_panic(expected = "ERR_NOT_SPONSOR_OR_OPERATOR")]
fn strangers_cannot_trigger_supply() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    e.call(&acc("mallory.near"), 0);
    let _ = v.supply(id, U128(1_000));
}

// --------------------------------------------------------------------------- yield

/// Pool price grows 10% (1.1 -> 1.21). Campaign value ≈ 1,100 USDC on 1,000 principal.
fn grown_asset(borrowed: u128) -> LendingAssetView {
    near_sdk::serde_json::from_str(&asset_json(POOL_SHARES, POOL_BALANCE * 11 / 10, borrowed)).unwrap()
}

#[test]
fn harvest_withdraws_only_excess_over_principal_and_buffer() {
    let (mut v, mut e) = setup();
    let (id, minted) = supplied_campaign(&mut v, &mut e);
    e.call(&operator(), 0);
    let _ = v.harvest_yield(id, U128(0));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    let _ = v.on_asset_for_withdraw(op, U128(0), Ok(Some(grown_asset(0))));
    let requested = v.pending_op.clone().unwrap().amount.0;
    // value = 1100 USDC (minus 1 unit margin), protected = 1000 * 1.005 = 1005
    let value = mul_div(minted, POOL_BALANCE * 11 / 10, POOL_SHARES) / E12 - 1;
    assert_eq!(requested, value - 1_005_000_000);
    assert!(requested > 94_000_000 && requested < 95_100_000);

    // Too early to reconcile
    e.advance(0, 1);
    e.call(&operator(), 0);
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut v2 = Vault { ..clone_vault(&v) };
        let _ = v2.reconcile_pending();
    }));
    assert!(early.is_err());

    e.advance(10_000, 10);
    let burned = mul_div(requested * E12, POOL_SHARES, POOL_BALANCE * 11 / 10) + 1;
    e.callback(vec![]);
    assert!(v.on_measured(
        op,
        Ok(Some(near_sdk::serde_json::from_str(&account_json(minted - burned)).unwrap())),
        Ok(Some(grown_asset(0)))
    ));
    let c = v.get_campaign(id).unwrap();
    let fee = requested / 10;
    assert_eq!(c.yield_available.0, requested - fee);
    assert_eq!(v.fees_accrued, fee);
    assert_eq!(c.principal_supplied.0, 1_000_000_000, "principal basis untouched by harvest");
    assert_eq!(c.rhea_shares.0, minted - burned);
    assert_invariants(&v);
}

fn clone_vault(v: &Vault) -> Vault {
    // Borsh round-trip of the top-level struct (collections share the mocked storage).
    near_sdk::borsh::from_slice(&near_sdk::borsh::to_vec(v).unwrap()).unwrap()
}

#[test]
fn harvest_aborts_when_no_yield() {
    let (mut v, mut e) = setup();
    let (id, _) = supplied_campaign(&mut v, &mut e);
    e.call(&operator(), 0);
    let _ = v.harvest_yield(id, U128(0));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    let r = v.on_asset_for_withdraw(op, U128(0), Ok(Some(near_sdk::serde_json::from_str(&asset_json(POOL_SHARES, POOL_BALANCE, 0)).unwrap())));
    assert!(matches!(r, near_sdk::PromiseOrValue::Value(false)));
    assert!(v.pending_op.is_none());
    assert_eq!(v.get_campaign(id).unwrap().yield_available.0, 0);
}

#[test]
fn harvest_aborts_on_insufficient_market_liquidity() {
    let (mut v, mut e) = setup();
    let (id, _) = supplied_campaign(&mut v, &mut e);
    e.call(&operator(), 0);
    let _ = v.harvest_yield(id, U128(0));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    // Market is fully borrowed
    let r = v.on_asset_for_withdraw(op, U128(0), Ok(Some(grown_asset(POOL_BALANCE * 11 / 10))));
    assert!(matches!(r, near_sdk::PromiseOrValue::Value(false)));
    assert!(v.pending_op.is_none());
    assert_invariants(&v);
}

#[test]
fn failed_withdrawal_credits_nothing() {
    let (mut v, mut e) = setup();
    let (id, minted) = supplied_campaign(&mut v, &mut e);
    e.call(&operator(), 0);
    let _ = v.harvest_yield(id, U128(0));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    let _ = v.on_asset_for_withdraw(op, U128(0), Ok(Some(grown_asset(0))));
    e.advance(10_000, 10);
    e.callback(vec![]);
    // RHEA reverted (e.g. transfer failed, shares re-credited): share balance unchanged
    assert!(!v.on_measured(op, Ok(Some(near_sdk::serde_json::from_str(&account_json(minted)).unwrap())), Ok(Some(grown_asset(0)))));
    assert!(v.pending_op.is_none());
    assert_eq!(v.get_campaign(id).unwrap().yield_available.0, 0);
    assert_invariants(&v);
}

#[test]
fn view_failure_keeps_lock_for_retry() {
    let (mut v, mut e) = setup();
    let (id, _) = supplied_campaign(&mut v, &mut e);
    e.call(&operator(), 0);
    let _ = v.harvest_yield(id, U128(0));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    let _ = v.on_asset_for_withdraw(op, U128(0), Ok(Some(grown_asset(0))));
    e.callback(vec![]);
    assert!(!v.on_measured(op, Err(near_sdk::PromiseError::Failed), Ok(Some(grown_asset(0)))));
    assert!(v.pending_op.is_some());
}

#[test]
fn full_principal_redemption_splits_principal_and_yield() {
    let (mut v, mut e) = setup();
    let (id, minted) = supplied_campaign(&mut v, &mut e);
    e.call(&sponsor(), 0);
    let _ = v.redeem_principal(id, U128(u128::MAX / 2));
    let op = v.pending_op.clone().unwrap().op_id;
    e.callback(vec![]);
    let _ = v.on_asset_for_withdraw(op, U128(0), Ok(Some(grown_asset(0))));
    let requested = v.pending_op.clone().unwrap().amount.0;
    e.advance(10_000, 10);
    let burned = mul_div(requested * E12, POOL_SHARES, POOL_BALANCE * 11 / 10) + 1;
    e.callback(vec![]);
    assert!(v.on_measured(op, Ok(Some(near_sdk::serde_json::from_str(&account_json(minted - burned)).unwrap())), Ok(Some(grown_asset(0)))));
    let c = v.get_campaign(id).unwrap();
    assert_eq!(c.principal_idle.0, 1_000_000_000);
    assert_eq!(c.principal_supplied.0, 0);
    let y = requested - 1_000_000_000;
    assert_eq!(c.yield_available.0, y - y / 10);
    assert_invariants(&v);
}

// --------------------------------------------------------------------------- periods

fn bonus_campaign(v: &mut Vault, e: &Env, cap: u128, sponsor_finalize: bool, random: bool) -> U64 {
    let id = create(v, e, cap, sponsor_finalize, random);
    fund(v, e, id, 1_000, true);
    id
}

const ROOT: &str = "1111111111111111111111111111111111111111111111111111111111111111";

fn commit(v: &mut Vault, e: &Env, id: U64, period: u32) {
    e.call(&operator(), 10u128.pow(23));
    v.commit_period(id, period, ROOT.into(), 2);
}

#[test]
#[should_panic(expected = "ERR_OPERATOR_RESERVE_CAP")]
fn operator_reservation_is_capped_by_sponsor() {
    let (mut v, e) = setup();
    let id = bonus_campaign(&mut v, &e, 100, false, false);
    commit(&mut v, &e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(101));
}

#[test]
fn sponsor_can_reserve_beyond_operator_cap() {
    let (mut v, e) = setup();
    let id = bonus_campaign(&mut v, &e, 100, false, false);
    commit(&mut v, &e, id, 1);
    e.call(&sponsor(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(600));
    assert_eq!(v.get_campaign(id).unwrap().reserved.0, 600);
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_YIELD")]
fn cannot_reserve_unrealized_yield() {
    let (mut v, e) = setup();
    let id = bonus_campaign(&mut v, &e, 1_000, false, false);
    commit(&mut v, &e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(1), U128(0));
}

struct Claimable {
    id: U64,
    alice_proof: Vec<String>,
    bob_proof: Vec<String>,
}

fn finalized(v: &mut Vault, e: &mut Env) -> Claimable {
    let id = bonus_campaign(v, e, 1_000, false, false);
    commit(v, e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(900));
    let a = leaf_hash(id.0, 1, "alice.near", 500);
    let b = leaf_hash(id.0, 1, "bob.near", 300);
    let root = hex::encode(node_hash(&a, &b));
    e.call(&operator(), 0);
    v.finalize_period(id, 1, root, U128(800), U64(30 * DAY));
    Claimable { id, alice_proof: vec![hex::encode(b)], bob_proof: vec![hex::encode(a)] }
}

#[test]
fn finalize_returns_unallocated_reserve() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    let camp = v.get_campaign(c.id).unwrap();
    assert_eq!(camp.reserved.0, 800);
    assert_eq!(camp.bonus_available.0, 200);
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_ALLOCATION_EXCEEDS_RESERVE")]
fn cannot_allocate_more_than_reserved() {
    let (mut v, e) = setup();
    let id = bonus_campaign(&mut v, &e, 1_000, false, false);
    commit(&mut v, &e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(100));
    v.finalize_period(id, 1, ROOT.into(), U128(101), U64(30 * DAY));
}

#[test]
#[should_panic(expected = "ERR_SPONSOR_MUST_FINALIZE")]
fn sponsor_finalize_mode_blocks_operator() {
    let (mut v, e) = setup();
    let id = bonus_campaign(&mut v, &e, 1_000, true, false);
    commit(&mut v, &e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(100));
    v.finalize_period(id, 1, ROOT.into(), U128(100), U64(30 * DAY));
}

#[test]
fn random_periods_need_a_later_block_seed() {
    let (mut v, mut e) = setup();
    let id = bonus_campaign(&mut v, &e, 1_000, false, true);
    commit(&mut v, &e, id, 1);
    e.call(&operator(), 0);
    v.reserve_for_period(id, 1, U128(0), U128(100));
    let same_block = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut v2 = clone_vault(&v);
        v2.record_seed(id, 1);
    }));
    assert!(same_block.is_err());
    let no_seed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut v2 = clone_vault(&v);
        v2.finalize_period(id, 1, ROOT.into(), U128(100), U64(30 * DAY));
    }));
    assert!(no_seed.is_err());
    e.advance(1_000_000_000, 1);
    e.call(&operator(), 0);
    let seed = v.record_seed(id, 1);
    assert_eq!(seed, hex::encode([7u8; 32]));
    v.finalize_period(id, 1, ROOT.into(), U128(100), U64(30 * DAY));
}

#[test]
#[should_panic(expected = "ERR_SEED_ALREADY_RECORDED")]
fn seed_can_only_be_recorded_once() {
    let (mut v, mut e) = setup();
    let id = bonus_campaign(&mut v, &e, 1_000, false, true);
    commit(&mut v, &e, id, 1);
    e.advance(1_000_000_000, 1);
    e.call(&operator(), 0);
    v.record_seed(id, 1);
    e.advance(1_000_000_000, 1);
    e.call(&operator(), 0);
    v.record_seed(id, 1);
}

#[test]
#[should_panic(expected = "ERR_DISPUTE_WINDOW_ACTIVE")]
fn claims_wait_for_dispute_window() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.call(&acc("alice.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof);
}

#[test]
fn valid_claim_then_double_claim_rejected() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    e.call(&acc("alice.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof.clone());
    assert!(v.is_claimed(c.id, 1, acc("alice.near")));
    let camp = v.get_campaign(c.id).unwrap();
    assert_eq!(camp.reserved.0, 300);
    assert_eq!(camp.claimed_total.0, 500);
    assert_invariants(&v);
    e.callback(vec![PromiseResult::Successful(vec![])]);
    assert!(v.on_claim_transferred(c.id, 1, acc("alice.near"), U128(500), Ok(())));
    e.call(&acc("alice.near"), 10u128.pow(22));
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut v2 = clone_vault(&v);
        let _ = v2.claim(c.id, 1, U128(500), c.alice_proof.clone());
    }));
    assert!(again.is_err());
}

#[test]
#[should_panic(expected = "ERR_INVALID_PROOF")]
fn claim_cannot_be_redirected_to_another_account() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    // mallory replays alice's leaf + proof
    e.call(&acc("mallory.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof);
}

#[test]
#[should_panic(expected = "ERR_INVALID_PROOF")]
fn claim_cannot_inflate_amount() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    e.call(&acc("bob.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(800), c.bob_proof);
}

#[test]
fn failed_claim_transfer_is_fully_reverted_and_retryable() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    e.call(&acc("bob.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(300), c.bob_proof.clone());
    e.callback(vec![PromiseResult::Failed]);
    assert!(!v.on_claim_transferred(c.id, 1, acc("bob.near"), U128(300), Err(near_sdk::PromiseError::Failed)));
    assert!(!v.is_claimed(c.id, 1, acc("bob.near")));
    assert_eq!(v.get_campaign(c.id).unwrap().reserved.0, 800);
    assert_invariants(&v);
    e.call(&acc("bob.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(300), c.bob_proof);
    assert!(v.is_claimed(c.id, 1, acc("bob.near")));
}

#[test]
#[should_panic(expected = "ERR_CLAIM_EXPIRED")]
fn expired_claims_rejected() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(32 * DAY, 1000);
    e.call(&acc("alice.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof);
}

#[test]
fn sponsor_can_veto_during_dispute_window() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.call(&sponsor(), 0);
    v.veto_period(c.id, 1, "wrong winners".into());
    let p = v.get_period(c.id, 1).unwrap();
    assert_eq!(p.status, PeriodStatus::Vetoed);
    assert_eq!(v.get_campaign(c.id).unwrap().reserved.0, 800, "reserve stays locked for the period");
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_NOT_SPONSOR_OR_GUARDIAN")]
fn operator_cannot_veto() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.call(&operator(), 0);
    v.veto_period(c.id, 1, "x".into());
}

#[test]
fn close_period_returns_unclaimed() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    e.call(&acc("alice.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof);
    e.advance(31 * DAY, 1000);
    e.call(&acc("anyone.near"), 0);
    v.close_period(c.id, 1);
    let camp = v.get_campaign(c.id).unwrap();
    assert_eq!(camp.reserved.0, 0);
    assert_eq!(camp.bonus_available.0, 500);
    assert_invariants(&v);
}

// --------------------------------------------------------------------------- sponsor exit & admin limits

#[test]
fn sponsor_withdraws_idle_principal_any_time_but_bonus_only_after_wind_down() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    fund(&mut v, &e, id, 500, true);
    e.call(&sponsor(), 0);
    let _ = v.sponsor_withdraw(id, U128(400), U128(0), U128(0));
    assert_eq!(v.get_campaign(id).unwrap().principal_idle.0, 600);
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut v2 = clone_vault(&v);
        let _ = v2.sponsor_withdraw(id, U128(0), U128(0), U128(1));
    }));
    assert!(early.is_err());
    v.begin_wind_down(id);
    let _ = v.sponsor_withdraw(id, U128(0), U128(0), U128(500));
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_EXCEEDS_AVAILABLE_BONUS")]
fn sponsor_cannot_withdraw_reserved_rewards() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.call(&sponsor(), 0);
    v.begin_wind_down(c.id);
    // 800 is reserved, only 200 bonus available
    let _ = v.sponsor_withdraw(c.id, U128(0), U128(0), U128(201));
}

#[test]
#[should_panic(expected = "ERR_NOT_SPONSOR")]
fn owner_cannot_withdraw_sponsor_funds() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    e.call(&owner(), 0);
    let _ = v.sponsor_withdraw(id, U128(1_000), U128(0), U128(0));
}

#[test]
fn failed_sponsor_transfer_restores_buckets() {
    let (mut v, e) = setup();
    let id = create(&mut v, &e, 0, false, false);
    fund(&mut v, &e, id, 1_000, false);
    e.call(&sponsor(), 0);
    let _ = v.sponsor_withdraw(id, U128(1_000), U128(0), U128(0));
    e.callback(vec![PromiseResult::Failed]);
    assert!(!v.on_sponsor_withdraw(id, U128(1_000), U128(0), U128(0), Err(near_sdk::PromiseError::Failed)));
    assert_eq!(v.get_campaign(id).unwrap().principal_idle.0, 1_000);
    assert_invariants(&v);
}

#[test]
#[should_panic(expected = "ERR_FEE_TOO_HIGH")]
fn fee_is_hard_capped() {
    let (mut v, e) = setup();
    e.call(&owner(), 0);
    v.set_fee(MAX_FEE_BPS + 1, acc("treasury.near"));
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn guardian_cannot_unpause() {
    let (mut v, e) = setup();
    e.call(&guardian(), 0);
    v.pause(true);
    v.unpause();
}

#[test]
#[should_panic(expected = "ERR_PAUSED")]
fn full_pause_blocks_claims() {
    let (mut v, mut e) = setup();
    let c = finalized(&mut v, &mut e);
    e.advance(DAY + 1, 1000);
    e.call(&guardian(), 0);
    v.pause(true);
    e.call(&acc("alice.near"), 10u128.pow(22));
    let _ = v.claim(c.id, 1, U128(500), c.alice_proof);
}

#[test]
#[should_panic(expected = "ERR_TIMELOCK_ACTIVE")]
fn upgrade_respects_timelock() {
    let (mut v, e) = setup();
    e.call(&owner(), 0);
    v.propose_upgrade(hex::encode(env::sha256(b"code")));
    let _ = v.apply_upgrade();
}

#[test]
#[should_panic(expected = "ERR_TIMELOCK_TOO_SHORT")]
fn init_rejects_short_timelock() {
    let e = Env { ts: 0, height: 1 };
    e.call(&owner(), 0);
    let _ = Vault::new(owner(), operator(), guardian(), token(), lending(), 12, 0, owner(), 0, U64(MIN_DISPUTE_WINDOW_NS), U64(3600));
}

#[test]
fn mul_div_handles_256_bit_intermediates() {
    let a = u128::MAX / 3;
    assert_eq!(mul_div(a, 3, 3), a);
    assert_eq!(mul_div(10u128.pow(30), 10u128.pow(30), 10u128.pow(32)), 10u128.pow(28));
    assert_eq!(mul_div(7, 3, 2), 10);
}
