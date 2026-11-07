//! Yielvy campaign vault.
//!
//! One shared vault contract holds every campaign's funds, with strictly isolated
//! per-campaign accounting (see docs/architecture/vault.md for the A/B comparison).
//!
//! Buckets per campaign (all in token units, never mixed):
//!   principal_idle      liquid sponsor principal not currently supplied
//!   principal_supplied  cost basis of principal inside RHEA
//!   rhea_shares         this campaign's slice of the vault's RHEA supply shares
//!   yield_available     realized, liquid, unreserved yield
//!   bonus_available     direct reward funding, liquid, unreserved (never called yield)
//!   reserved            liquid funds locked for reward periods
//! Contract-wide: fees_accrued (platform fee on realized yield only).
//!
//! Invariants (checked in tests and exposed via `check_invariants`):
//!   liquid_tracked == Σ(principal_idle + yield_available + bonus_available + reserved) + fees_accrued
//!   total_rhea_shares == Σ rhea_shares
//!   ft_balance_of(vault) >= liquid_tracked   (verified off-chain by reconciliation)
//!
//! Trust model:
//!   owner     (multisig)  config within hard caps, timelocked upgrades. CANNOT move campaign funds.
//!   operator  (hot key)   triggers supply/settlement/periods within sponsor-set caps.
//!                         Allocation roots are subject to a dispute window during which the
//!                         sponsor or guardian can veto. CANNOT withdraw to arbitrary accounts.
//!   guardian             can pause and veto. Cannot unpause or move funds.
//!   sponsor              funds, withdraws its own unreserved balances, optional finalize control.
//! Tokens leave the vault only to: the sponsor, a Merkle-proven claimant, RHEA (supply),
//! or fee_recipient (fees_accrued only).

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault};

mod events;
mod external;
mod funding;
mod lending;
pub mod merkle;
mod periods;
mod upgrade;

#[cfg(test)]
mod tests;

pub use external::*;

pub const MAX_FEE_BPS: u16 = 2_000;
pub const MAX_SAFETY_BUFFER_BPS: u16 = 1_000;
pub const MIN_DISPUTE_WINDOW_NS: u64 = 3_600 * 1_000_000_000;
pub const MIN_UPGRADE_TIMELOCK_NS: u64 = 72 * 3_600 * 1_000_000_000;
pub const MIN_CLAIM_WINDOW_NS: u64 = 7 * 24 * 3_600 * 1_000_000_000;
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FT_TRANSFER_CALL: Gas = Gas::from_tgas(100);
pub const GAS_VIEW: Gas = Gas::from_tgas(10);
pub const GAS_LENDING_EXECUTE: Gas = Gas::from_tgas(120);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(15);
pub const GAS_CALLBACK_WITH_MEASURE: Gas = Gas::from_tgas(50);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Campaigns,
    Periods,
    Claimed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CampaignStatus {
    Active,
    /// Wind-down: no new periods; sponsor may withdraw unreserved liquid funds.
    Closing,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Campaign {
    pub sponsor: AccountId,
    pub status: CampaignStatus,
    pub principal_idle: U128,
    pub principal_supplied: U128,
    pub rhea_shares: U128,
    pub yield_available: U128,
    pub bonus_available: U128,
    pub reserved: U128,
    pub claimed_total: U128,
    pub yield_realized_total: U128,
    /// Maximum the OPERATOR may reserve per period. Sponsor reservations are uncapped.
    pub max_operator_reserve_per_period: U128,
    pub require_sponsor_finalize: bool,
    pub random_enabled: bool,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PeriodStatus {
    Committed,
    Finalized,
    Vetoed,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Period {
    pub status: PeriodStatus,
    pub eligibility_root: String,
    pub eligible_count: u32,
    pub committed_height: U64,
    pub seed: Option<String>,
    pub reserved_yield: U128,
    pub reserved_bonus: U128,
    pub allocation_root: Option<String>,
    pub allocated_total: U128,
    pub claimed_amount: U128,
    pub claimable_after: U64,
    pub claim_deadline: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OpPurpose {
    Supply,
    HarvestYield,
    RedeemPrincipal,
}

/// The single in-flight RHEA operation. RHEA calls are serialized so share and
/// token deltas can be attributed to exactly one campaign.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PendingOp {
    pub op_id: U64,
    pub campaign_id: U64,
    pub purpose: OpPurpose,
    /// Supply: tokens sent. Withdrawals: max_amount requested (token units).
    pub amount: U128,
    pub started_at: U64,
    pub started_height: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Default, Debug)]
pub struct PauseState {
    /// Blocks deposits, supply, reservations, commits and finalization.
    pub inflows: bool,
    /// Additionally blocks claims and sponsor withdrawals (incident response only).
    pub all: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PendingUpgrade {
    pub code_hash: String,
    pub eta: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    pub(crate) owner_id: AccountId,
    pub(crate) proposed_owner_id: Option<AccountId>,
    pub(crate) operator_id: AccountId,
    pub(crate) guardian_id: AccountId,
    pub(crate) token_id: AccountId,
    pub(crate) lending_id: AccountId,
    pub(crate) extra_decimals: u8,
    pub(crate) fee_bps: u16,
    pub(crate) fee_recipient: AccountId,
    pub(crate) safety_buffer_bps: u16,
    pub(crate) dispute_window_ns: u64,
    pub(crate) upgrade_timelock_ns: u64,
    pub(crate) pending_upgrade: Option<PendingUpgrade>,
    pub(crate) pause: PauseState,
    pub(crate) campaigns: IterableMap<u64, Campaign>,
    pub(crate) next_campaign_id: u64,
    pub(crate) periods: LookupMap<(u64, u32), Period>,
    pub(crate) claimed: LookupSet<(u64, u32, AccountId)>,
    pub(crate) total_rhea_shares: u128,
    pub(crate) liquid_tracked: u128,
    pub(crate) fees_accrued: u128,
    pub(crate) pending_op: Option<PendingOp>,
    pub(crate) next_op_id: u64,
}

#[near(serializers = [json])]
pub struct VaultConfig {
    pub owner_id: AccountId,
    pub operator_id: AccountId,
    pub guardian_id: AccountId,
    pub token_id: AccountId,
    pub lending_id: AccountId,
    pub extra_decimals: u8,
    pub fee_bps: u16,
    pub fee_recipient: AccountId,
    pub safety_buffer_bps: u16,
    pub dispute_window_ns: U64,
    pub upgrade_timelock_ns: U64,
    pub pending_upgrade: Option<PendingUpgrade>,
    pub pause: PauseState,
}

#[near(serializers = [json])]
pub struct VaultTotals {
    pub campaigns: U64,
    pub total_rhea_shares: U128,
    pub liquid_tracked: U128,
    pub fees_accrued: U128,
    pub pending_op: Option<PendingOp>,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct InvariantReport {
    pub ok: bool,
    pub liquid_sum: U128,
    pub liquid_tracked: U128,
    pub shares_sum: U128,
    pub total_rhea_shares: U128,
}

#[near]
impl Vault {
    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        owner_id: AccountId,
        operator_id: AccountId,
        guardian_id: AccountId,
        token_id: AccountId,
        lending_id: AccountId,
        extra_decimals: u8,
        fee_bps: u16,
        fee_recipient: AccountId,
        safety_buffer_bps: u16,
        dispute_window_ns: U64,
        upgrade_timelock_ns: U64,
    ) -> Self {
        require!(fee_bps <= MAX_FEE_BPS, "ERR_FEE_TOO_HIGH");
        require!(safety_buffer_bps <= MAX_SAFETY_BUFFER_BPS, "ERR_BUFFER_TOO_HIGH");
        require!(dispute_window_ns.0 >= MIN_DISPUTE_WINDOW_NS, "ERR_DISPUTE_WINDOW_TOO_SHORT");
        require!(upgrade_timelock_ns.0 >= MIN_UPGRADE_TIMELOCK_NS, "ERR_TIMELOCK_TOO_SHORT");
        require!(extra_decimals <= 24, "ERR_EXTRA_DECIMALS");
        require!(operator_id != owner_id, "ERR_OPERATOR_MUST_DIFFER_FROM_OWNER");
        Self {
            owner_id,
            proposed_owner_id: None,
            operator_id,
            guardian_id,
            token_id,
            lending_id,
            extra_decimals,
            fee_bps,
            fee_recipient,
            safety_buffer_bps,
            dispute_window_ns: dispute_window_ns.0,
            upgrade_timelock_ns: upgrade_timelock_ns.0,
            pending_upgrade: None,
            pause: PauseState::default(),
            campaigns: IterableMap::new(StorageKey::Campaigns),
            next_campaign_id: 1,
            periods: LookupMap::new(StorageKey::Periods),
            claimed: LookupSet::new(StorageKey::Claimed),
            total_rhea_shares: 0,
            liquid_tracked: 0,
            fees_accrued: 0,
            pending_op: None,
            next_op_id: 1,
        }
    }

    // ---------------------------------------------------------------- roles & config

    pub fn propose_owner(&mut self, new_owner_id: AccountId) {
        self.assert_owner();
        self.proposed_owner_id = Some(new_owner_id);
    }

    pub fn accept_owner(&mut self) {
        let caller = env::predecessor_account_id();
        require!(self.proposed_owner_id.as_ref() == Some(&caller), "ERR_NOT_PROPOSED_OWNER");
        events::emit("owner_changed", &serde_json_obj(&[("old", self.owner_id.as_str()), ("new", caller.as_str())]));
        self.owner_id = caller;
        self.proposed_owner_id = None;
    }

    pub fn set_operator(&mut self, operator_id: AccountId) {
        self.assert_owner();
        require!(operator_id != self.owner_id, "ERR_OPERATOR_MUST_DIFFER_FROM_OWNER");
        events::emit("operator_changed", &serde_json_obj(&[("new", operator_id.as_str())]));
        self.operator_id = operator_id;
    }

    pub fn set_guardian(&mut self, guardian_id: AccountId) {
        self.assert_owner();
        events::emit("guardian_changed", &serde_json_obj(&[("new", guardian_id.as_str())]));
        self.guardian_id = guardian_id;
    }

    /// Fee applies only to yield realized AFTER the change. Hard-capped at MAX_FEE_BPS.
    pub fn set_fee(&mut self, fee_bps: u16, fee_recipient: AccountId) {
        self.assert_owner();
        require!(fee_bps <= MAX_FEE_BPS, "ERR_FEE_TOO_HIGH");
        events::emit("fee_changed", &serde_json_obj(&[("fee_bps", &fee_bps.to_string()), ("recipient", fee_recipient.as_str())]));
        self.fee_bps = fee_bps;
        self.fee_recipient = fee_recipient;
    }

    pub fn set_safety_buffer(&mut self, safety_buffer_bps: u16) {
        self.assert_owner();
        require!(safety_buffer_bps <= MAX_SAFETY_BUFFER_BPS, "ERR_BUFFER_TOO_HIGH");
        self.safety_buffer_bps = safety_buffer_bps;
    }

    pub fn set_dispute_window(&mut self, dispute_window_ns: U64) {
        self.assert_owner();
        require!(dispute_window_ns.0 >= MIN_DISPUTE_WINDOW_NS, "ERR_DISPUTE_WINDOW_TOO_SHORT");
        self.dispute_window_ns = dispute_window_ns.0;
    }

    /// Guardian or owner may pause. Only the owner may unpause.
    pub fn pause(&mut self, all: bool) {
        let c = env::predecessor_account_id();
        require!(c == self.guardian_id || c == self.owner_id, "ERR_NOT_GUARDIAN");
        self.pause.inflows = true;
        if all {
            self.pause.all = true;
        }
        events::emit("paused", &serde_json_obj(&[("by", c.as_str()), ("all", if all { "true" } else { "false" })]));
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.pause = PauseState::default();
        events::emit("unpaused", &serde_json_obj(&[("by", self.owner_id.as_str())]));
    }

    /// Transfers accumulated platform fees (taken only from realized yield) to fee_recipient.
    pub fn withdraw_fees(&mut self) -> near_sdk::Promise {
        self.assert_owner();
        let amount = self.fees_accrued;
        require!(amount > 0, "ERR_NO_FEES");
        self.fees_accrued = 0;
        self.liquid_tracked -= amount;
        let recipient = self.fee_recipient.clone();
        events::emit("fees_withdrawn", &serde_json_obj(&[("amount", &amount.to_string()), ("to", recipient.as_str())]));
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(recipient, U128(amount), Some("yielvy platform fee".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_fees_transferred(U128(amount)))
    }

    #[private]
    pub fn on_fees_transferred(&mut self, amount: U128, #[callback_result] r: Result<(), near_sdk::PromiseError>) -> bool {
        if r.is_err() {
            self.fees_accrued += amount.0;
            self.liquid_tracked += amount.0;
            events::emit("fees_withdraw_failed", &serde_json_obj(&[("amount", &amount.0.to_string())]));
            return false;
        }
        true
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> VaultConfig {
        VaultConfig {
            owner_id: self.owner_id.clone(),
            operator_id: self.operator_id.clone(),
            guardian_id: self.guardian_id.clone(),
            token_id: self.token_id.clone(),
            lending_id: self.lending_id.clone(),
            extra_decimals: self.extra_decimals,
            fee_bps: self.fee_bps,
            fee_recipient: self.fee_recipient.clone(),
            safety_buffer_bps: self.safety_buffer_bps,
            dispute_window_ns: U64(self.dispute_window_ns),
            upgrade_timelock_ns: U64(self.upgrade_timelock_ns),
            pending_upgrade: self.pending_upgrade.clone(),
            pause: self.pause,
        }
    }

    pub fn get_totals(&self) -> VaultTotals {
        VaultTotals {
            campaigns: U64(self.campaigns.len() as u64),
            total_rhea_shares: U128(self.total_rhea_shares),
            liquid_tracked: U128(self.liquid_tracked),
            fees_accrued: U128(self.fees_accrued),
            pending_op: self.pending_op.clone(),
        }
    }

    pub fn get_campaign(&self, campaign_id: U64) -> Option<Campaign> {
        self.campaigns.get(&campaign_id.0).cloned()
    }

    pub fn get_period(&self, campaign_id: U64, period_id: u32) -> Option<Period> {
        self.periods.get(&(campaign_id.0, period_id)).cloned()
    }

    pub fn is_claimed(&self, campaign_id: U64, period_id: u32, account_id: AccountId) -> bool {
        self.claimed.contains(&(campaign_id.0, period_id, account_id))
    }

    /// Full scan; intended for reconciliation jobs and tests. Bounded by `limit`.
    pub fn check_invariants(&self, limit: Option<u32>) -> InvariantReport {
        let limit = limit.unwrap_or(500) as usize;
        require!(self.campaigns.len() as usize <= limit, "ERR_TOO_MANY_CAMPAIGNS_FOR_SCAN");
        let mut liquid: u128 = self.fees_accrued;
        let mut shares: u128 = 0;
        for (_, c) in self.campaigns.iter() {
            liquid += c.principal_idle.0 + c.yield_available.0 + c.bonus_available.0 + c.reserved.0;
            shares += c.rhea_shares.0;
        }
        InvariantReport {
            ok: liquid == self.liquid_tracked && shares == self.total_rhea_shares,
            liquid_sum: U128(liquid),
            liquid_tracked: U128(self.liquid_tracked),
            shares_sum: U128(shares),
            total_rhea_shares: U128(self.total_rhea_shares),
        }
    }

    // ---------------------------------------------------------------- internal helpers

    pub(crate) fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "ERR_NOT_OWNER");
    }

    pub(crate) fn assert_inflows_open(&self) {
        require!(!self.pause.inflows && !self.pause.all, "ERR_PAUSED");
    }

    pub(crate) fn assert_not_fully_paused(&self) {
        require!(!self.pause.all, "ERR_PAUSED");
    }

    pub(crate) fn campaign_mut(&mut self, id: u64) -> &mut Campaign {
        self.campaigns.get_mut(&id).unwrap_or_else(|| env::panic_str("ERR_NO_CAMPAIGN"))
    }

    pub(crate) fn campaign(&self, id: u64) -> &Campaign {
        self.campaigns.get(&id).unwrap_or_else(|| env::panic_str("ERR_NO_CAMPAIGN"))
    }
}

/// Small helper to build flat JSON event payloads without pulling serde_json into wasm twice.
pub(crate) fn serde_json_obj(pairs: &[(&str, &str)]) -> String {
    let mut s = String::from("{");
    for (i, (k, v)) in pairs.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&near_sdk::serde_json::to_string(k).unwrap());
        s.push(':');
        s.push_str(&near_sdk::serde_json::to_string(v).unwrap());
    }
    s.push('}');
    s
}
