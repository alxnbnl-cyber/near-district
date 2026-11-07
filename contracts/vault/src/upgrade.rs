//! Timelocked upgrades. The owner (intended: a multisig) proposes a code hash; after
//! `upgrade_timelock_ns` (>= 72h, can only be increased) the exact matching code may be
//! deployed. The proposal is public on-chain, so sponsors can exit before it applies.
use crate::*;
use near_sdk::Promise;

#[near]
impl Vault {
    pub fn propose_upgrade(&mut self, code_hash_hex: String) {
        self.assert_owner();
        let _ = merkle::parse_hex32(&code_hash_hex);
        let eta = env::block_timestamp() + self.upgrade_timelock_ns;
        self.pending_upgrade = Some(PendingUpgrade { code_hash: code_hash_hex.clone(), eta: U64(eta) });
        events::emit("upgrade_proposed", &serde_json_obj(&[("code_hash", &code_hash_hex), ("eta", &eta.to_string())]));
    }

    /// Owner or guardian may cancel a pending upgrade.
    pub fn cancel_upgrade(&mut self) {
        let c = env::predecessor_account_id();
        require!(c == self.owner_id || c == self.guardian_id, "ERR_NOT_OWNER_OR_GUARDIAN");
        require!(self.pending_upgrade.take().is_some(), "ERR_NO_PENDING_UPGRADE");
        events::emit("upgrade_cancelled", &serde_json_obj(&[("by", c.as_str())]));
    }

    pub fn increase_upgrade_timelock(&mut self, upgrade_timelock_ns: U64) {
        self.assert_owner();
        require!(upgrade_timelock_ns.0 > self.upgrade_timelock_ns, "ERR_CAN_ONLY_INCREASE");
        self.upgrade_timelock_ns = upgrade_timelock_ns.0;
    }

    /// Raw wasm is passed as the call's input (not JSON). Must match the proposed hash.
    pub fn apply_upgrade(&mut self) -> Promise {
        self.assert_owner();
        let pending = self.pending_upgrade.take().unwrap_or_else(|| env::panic_str("ERR_NO_PENDING_UPGRADE"));
        require!(env::block_timestamp() >= pending.eta.0, "ERR_TIMELOCK_ACTIVE");
        let code = env::input().unwrap_or_else(|| env::panic_str("ERR_NO_CODE"));
        require!(hex::encode(env::sha256(&code)) == pending.code_hash, "ERR_CODE_HASH_MISMATCH");
        require!(self.pending_op.is_none(), "ERR_OPERATION_IN_PROGRESS");
        events::emit("upgrade_applied", &serde_json_obj(&[("code_hash", &pending.code_hash)]));
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call("migrate".to_string(), vec![], NearToken::from_yoctonear(0), Gas::from_tgas(50))
    }

    /// Called by the new code after an upgrade. State layout changes must be handled here.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        env::state_read().unwrap_or_else(|| env::panic_str("ERR_NO_STATE"))
    }
}
