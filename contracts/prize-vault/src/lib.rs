//! NEAR District prize vault.
//!
//! A project locks a fixed mission prize in one NEP-141 token (testnet: USDC). After the mission
//! deadline the operator (the NEAR District backend, which checks the sealed answers off-chain)
//! posts the list of players who solved every secret. The contract then splits the prize into
//! equal shares and pays each winner automatically. Any rounding remainder, or the whole prize
//! when nobody qualified, goes back to the project.
//!
//! What the contract guarantees, whatever the operator does:
//!   * prize tokens leave the vault only to a posted winner (exactly one equal share each)
//!     or back to the mission's sponsor;
//!   * winners can only be posted after the deadline, once per mission, without duplicates;
//!   * every winner gets the same amount: floor(prize / winners);
//!   * if the operator never settles, the sponsor can take the full prize back after a grace period.
//! What it trusts the operator for: deciding who solved every secret (answers are sealed and
//! checked off-chain, so they can't be verified on-chain).
//!
//! Mission lifecycle: Open -(finalize)-> Paying -(all paid)-> Completed
//!                    Open -(finalize with no winners | sponsor refund after grace)-> Refunded
//! Funding:  sponsor calls `ft_transfer_call` on the token with msg `{"mission_id":"<id>"}`.
//! Events:   NEP-297 `EVENT_JSON` logs, standard `near_district_prize_vault`.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};

pub const EVENT_STANDARD: &str = "near_district_prize_vault";
pub const EVENT_VERSION: &str = "1.0.0";
/// storage for one mission record, paid by the sponsor when creating it
pub const MISSION_STORAGE: NearToken = NearToken::from_millinear(10);
/// storage for one posted winner, paid by the operator when finalizing
pub const WINNER_STORAGE: NearToken = NearToken::from_micronear(1500);
pub const MAX_WINNERS_PER_MISSION: u32 = 500;
pub const MAX_PAYOUTS_PER_CALL: u32 = 10;
/// how long after the deadline the sponsor must wait before reclaiming an unsettled prize
pub const REFUND_GRACE_NS: u64 = 14 * 24 * 3600 * 1_000_000_000;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(6);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MissionStatus {
    Open,
    Paying,
    Completed,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PayoutState {
    Pending,
    InFlight,
    Paid,
    Failed,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Mission {
    pub sponsor: AccountId,
    pub deadline_ns: u64,
    pub prize: u128,
    pub status: MissionStatus,
    pub winner_count: u32,
    pub share: u128,
    pub next_index: u32,
    pub paid_count: u32,
    pub paid_total: u128,
    /// owed back to the sponsor (rounding remainder or unspent prize), not yet sent
    pub refund_owed: u128,
    pub refunded_total: u128,
    pub created_at_ns: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Winner {
    pub account_id: AccountId,
    pub state: PayoutState,
    pub tx_attempts: u8,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MissionView {
    pub mission_id: U64,
    pub sponsor: AccountId,
    pub deadline_ns: U64,
    pub prize: U128,
    pub status: MissionStatus,
    pub winner_count: u32,
    pub share: U128,
    pub next_index: u32,
    pub paid_count: u32,
    pub paid_total: U128,
    pub refund_owed: U128,
    pub refunded_total: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct WinnerView {
    pub index: u32,
    pub account_id: AccountId,
    pub state: PayoutState,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ConfigView {
    pub owner_id: AccountId,
    pub operator_id: AccountId,
    pub token_id: AccountId,
    pub missions: U64,
    pub refund_grace_ns: U64,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct FundMsg {
    mission_id: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PrizeVault {
    owner_id: AccountId,
    operator_id: AccountId,
    token_id: AccountId,
    next_mission_id: u64,
    missions: LookupMap<u64, Mission>,
    winners: LookupMap<(u64, u32), Winner>,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    ));
}

#[near]
impl PrizeVault {
    #[init]
    pub fn new(owner_id: AccountId, operator_id: AccountId, token_id: AccountId) -> Self {
        Self {
            owner_id,
            operator_id,
            token_id,
            next_mission_id: 1,
            missions: LookupMap::new(b"m"),
            winners: LookupMap::new(b"w"),
        }
    }

    // ------------------------------------------------------------------ sponsor

    /// Opens a mission escrow for the caller. Attach at least 0.01 NEAR for storage.
    #[payable]
    pub fn create_mission(&mut self, deadline_ns: U64) -> U64 {
        require!(env::attached_deposit() >= MISSION_STORAGE, "Attach at least 0.01 NEAR for storage");
        require!(deadline_ns.0 > env::block_timestamp(), "Deadline must be in the future");
        let id = self.next_mission_id;
        self.next_mission_id += 1;
        let sponsor = env::predecessor_account_id();
        self.missions.insert(
            id,
            Mission {
                sponsor: sponsor.clone(),
                deadline_ns: deadline_ns.0,
                prize: 0,
                status: MissionStatus::Open,
                winner_count: 0,
                share: 0,
                next_index: 0,
                paid_count: 0,
                paid_total: 0,
                refund_owed: 0,
                refunded_total: 0,
                created_at_ns: env::block_timestamp(),
            },
        );
        emit("mission_created", json!({ "mission_id": id.to_string(), "sponsor": sponsor, "deadline_ns": deadline_ns.0.to_string() }));
        U64(id)
    }

    /// NEP-141 receiver: credits a prize deposit. Anything invalid panics, so the token refunds it.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.token_id, "Only the prize token is accepted");
        require!(amount.0 > 0, "Amount must be above zero");
        let parsed: FundMsg = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("msg must be {\"mission_id\":\"<id>\"}"));
        let id = parsed.mission_id.0;
        let mut m = self.mission_or_panic(id);
        require!(m.status == MissionStatus::Open, "Mission is not open for funding");
        require!(sender_id == m.sponsor, "Only the mission's sponsor can fund it");
        require!(env::block_timestamp() < m.deadline_ns, "Mission deadline has passed");
        m.prize = m.prize.checked_add(amount.0).expect("prize overflow");
        let total = m.prize;
        self.missions.insert(id, m);
        emit("prize_funded", json!({ "mission_id": id.to_string(), "sponsor": sender_id, "amount": amount.0.to_string(), "prize_total": total.to_string() }));
        PromiseOrValue::Value(U128(0))
    }

    /// Safety valve: if the operator never settled, the sponsor takes the full prize back.
    pub fn refund_unsettled(&mut self, mission_id: U64) -> Promise {
        let id = mission_id.0;
        let mut m = self.mission_or_panic(id);
        require!(env::predecessor_account_id() == m.sponsor, "Only the sponsor");
        require!(m.status == MissionStatus::Open, "Mission was already settled");
        require!(env::block_timestamp() >= m.deadline_ns.saturating_add(REFUND_GRACE_NS), "Refund opens 14 days after the deadline");
        m.status = MissionStatus::Refunded;
        m.refund_owed = m.prize;
        self.missions.insert(id, m);
        emit("mission_refunded", json!({ "mission_id": id.to_string(), "reason": "unsettled" }));
        self.send_refund(id)
    }

    /// Sends whatever is owed back to the sponsor (remainder or unspent prize). Anyone may trigger it:
    /// the tokens can only go to the sponsor.
    pub fn withdraw_refund(&mut self, mission_id: U64) -> Promise {
        self.send_refund(mission_id.0)
    }

    // ------------------------------------------------------------------ operator

    /// Posts the players who solved every secret. Equal shares are fixed here; payouts follow.
    /// Attach 0.0015 NEAR per winner for storage.
    #[payable]
    pub fn finalize(&mut self, mission_id: U64, winners: Vec<AccountId>) -> U128 {
        self.assert_operator();
        let id = mission_id.0;
        let mut m = self.mission_or_panic(id);
        require!(m.status == MissionStatus::Open, "Mission already finalized");
        require!(env::block_timestamp() >= m.deadline_ns, "Mission deadline has not passed");
        let n = winners.len() as u32;
        require!(n <= MAX_WINNERS_PER_MISSION, "Too many winners");
        require!(env::attached_deposit() >= WINNER_STORAGE.saturating_mul(n as u128), "Attach 0.0015 NEAR per winner for storage");
        let mut sorted = winners.clone();
        sorted.sort();
        sorted.dedup();
        require!(sorted.len() == winners.len(), "Duplicate winner");
        require!(!winners.iter().any(|w| *w == env::current_account_id()), "Vault cannot be a winner");

        if n == 0 || m.prize == 0 {
            m.status = MissionStatus::Refunded;
            m.refund_owed = m.prize;
            self.missions.insert(id, m.clone());
            emit("winners_finalized", json!({ "mission_id": id.to_string(), "winner_count": 0, "share": "0", "remainder": m.prize.to_string() }));
            return U128(0);
        }
        let share = m.prize / n as u128;
        let remainder = m.prize - share * n as u128;
        for (i, w) in winners.iter().enumerate() {
            self.winners.insert((id, i as u32), Winner { account_id: w.clone(), state: PayoutState::Pending, tx_attempts: 0 });
        }
        m.status = MissionStatus::Paying;
        m.winner_count = n;
        m.share = share;
        m.refund_owed = remainder;
        self.missions.insert(id, m);
        emit("winners_finalized", json!({ "mission_id": id.to_string(), "winner_count": n, "share": share.to_string(), "remainder": remainder.to_string() }));
        U128(share)
    }

    /// Pays the next batch of winners (at most 10 per call). Permissionless: recipients and amounts
    /// are fixed by `finalize`, so anyone can push payouts along.
    pub fn payout(&mut self, mission_id: U64) -> u32 {
        let id = mission_id.0;
        let mut m = self.mission_or_panic(id);
        require!(m.status == MissionStatus::Paying, "Mission is not paying out");
        let mut sent = 0;
        while m.next_index < m.winner_count && sent < MAX_PAYOUTS_PER_CALL {
            let idx = m.next_index;
            m.next_index += 1;
            self.send_share(id, idx, m.share);
            sent += 1;
        }
        self.missions.insert(id, m);
        sent
    }

    /// Re-sends shares whose transfer failed (e.g. the winner wasn't registered with the token yet).
    pub fn retry_payouts(&mut self, mission_id: U64, indexes: Vec<u32>) -> u32 {
        let id = mission_id.0;
        let m = self.mission_or_panic(id);
        require!(m.status == MissionStatus::Paying, "Mission is not paying out");
        require!(indexes.len() as u32 <= MAX_PAYOUTS_PER_CALL, "Too many in one call");
        let mut sent = 0;
        for idx in indexes {
            let w = self.winners.get(&(id, idx)).unwrap_or_else(|| env::panic_str("No such winner"));
            if w.state == PayoutState::Failed {
                self.send_share(id, idx, m.share);
                sent += 1;
            }
        }
        sent
    }

    // ------------------------------------------------------------------ callbacks

    #[private]
    pub fn on_share_sent(&mut self, mission_id: U64, index: u32, #[callback_result] result: Result<(), PromiseError>) -> bool {
        let id = mission_id.0;
        let mut m = self.mission_or_panic(id);
        let mut w = self.winners.get(&(id, index)).cloned().expect("winner");
        let ok = result.is_ok();
        if ok {
            w.state = PayoutState::Paid;
            m.paid_count += 1;
            m.paid_total += m.share;
            emit("reward_paid", json!({ "mission_id": id.to_string(), "account_id": w.account_id, "amount": m.share.to_string(), "index": index }));
            if m.paid_count == m.winner_count {
                m.status = MissionStatus::Completed;
                emit("mission_completed", json!({ "mission_id": id.to_string(), "winner_count": m.winner_count, "paid_total": m.paid_total.to_string() }));
            }
        } else {
            w.state = PayoutState::Failed;
            emit("reward_failed", json!({ "mission_id": id.to_string(), "account_id": w.account_id, "amount": m.share.to_string(), "index": index }));
        }
        self.winners.insert((id, index), w);
        self.missions.insert(id, m);
        ok
    }

    #[private]
    pub fn on_refund_sent(&mut self, mission_id: U64, amount: U128, #[callback_result] result: Result<(), PromiseError>) -> bool {
        let id = mission_id.0;
        let mut m = self.mission_or_panic(id);
        if result.is_ok() {
            m.refunded_total += amount.0;
            emit("refund_sent", json!({ "mission_id": id.to_string(), "sponsor": m.sponsor, "amount": amount.0.to_string() }));
        } else {
            m.refund_owed += amount.0; // put it back so it can be retried
            emit("refund_failed", json!({ "mission_id": id.to_string(), "amount": amount.0.to_string() }));
        }
        self.missions.insert(id, m);
        result.is_ok()
    }

    // ------------------------------------------------------------------ owner

    pub fn set_operator(&mut self, operator_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner");
        self.operator_id = operator_id;
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner_id: self.owner_id.clone(),
            operator_id: self.operator_id.clone(),
            token_id: self.token_id.clone(),
            missions: U64(self.next_mission_id - 1),
            refund_grace_ns: U64(REFUND_GRACE_NS),
        }
    }

    pub fn get_mission(&self, mission_id: U64) -> Option<MissionView> {
        self.missions.get(&mission_id.0).map(|m| MissionView {
            mission_id,
            sponsor: m.sponsor.clone(),
            deadline_ns: U64(m.deadline_ns),
            prize: U128(m.prize),
            status: m.status,
            winner_count: m.winner_count,
            share: U128(m.share),
            next_index: m.next_index,
            paid_count: m.paid_count,
            paid_total: U128(m.paid_total),
            refund_owed: U128(m.refund_owed),
            refunded_total: U128(m.refunded_total),
        })
    }

    pub fn get_winners(&self, mission_id: U64, from_index: u32, limit: u32) -> Vec<WinnerView> {
        let Some(m) = self.missions.get(&mission_id.0) else { return vec![] };
        let end = m.winner_count.min(from_index.saturating_add(limit.min(100)));
        (from_index..end)
            .filter_map(|i| self.winners.get(&(mission_id.0, i)).map(|w| WinnerView { index: i, account_id: w.account_id.clone(), state: w.state }))
            .collect()
    }

    // ------------------------------------------------------------------ internal

    fn mission_or_panic(&self, id: u64) -> Mission {
        self.missions.get(&id).cloned().unwrap_or_else(|| env::panic_str("Mission not found"))
    }

    fn assert_operator(&self) {
        require!(env::predecessor_account_id() == self.operator_id, "Only the operator");
    }

    fn send_share(&mut self, id: u64, idx: u32, share: u128) {
        let mut w = self.winners.get(&(id, idx)).cloned().expect("winner");
        w.state = PayoutState::InFlight;
        w.tx_attempts = w.tx_attempts.saturating_add(1);
        let to = w.account_id.clone();
        self.winners.insert((id, idx), w);
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to, U128(share), Some(format!("NEAR District prize share, mission {id}")))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_share_sent(U64(id), idx));
    }

    fn send_refund(&mut self, id: u64) -> Promise {
        let mut m = self.mission_or_panic(id);
        require!(m.refund_owed > 0, "Nothing to refund");
        require!(m.status != MissionStatus::Open, "Mission is still open");
        let amount = m.refund_owed;
        m.refund_owed = 0;
        let sponsor = m.sponsor.clone();
        self.missions.insert(id, m);
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(sponsor, U128(amount), Some(format!("NEAR District prize refund, mission {id}")))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_refund_sent(U64(id), U128(amount)))
    }
}

#[cfg(test)]
mod tests;
