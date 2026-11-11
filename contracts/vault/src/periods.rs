//! Reward periods: freeze eligibility -> reserve funds -> (optional) on-chain seed ->
//! finalize allocation root -> dispute window -> Merkle-proof claims -> close.
use crate::merkle::{leaf_hash, parse_hex32, verify};
use crate::*;
use near_sdk::{Promise, PromiseError};

#[near]
impl Vault {
    /// Freezes the eligibility snapshot by committing its hash BEFORE any randomness exists.
    /// The caller pays the period's storage.
    #[payable]
    pub fn commit_period(&mut self, campaign_id: U64, period_id: u32, eligibility_root: String, eligible_count: u32) {
        self.assert_inflows_open();
        self.assert_operator_or_sponsor(campaign_id.0);
        let _ = parse_hex32(&eligibility_root);
        require!(self.campaign(campaign_id.0).status == CampaignStatus::Active, "ERR_CAMPAIGN_NOT_ACTIVE");
        let key = (campaign_id.0, period_id);
        require!(self.periods.get(&key).is_none(), "ERR_PERIOD_EXISTS");
        let before = env::storage_usage();
        self.periods.insert(
            key,
            Period {
                status: PeriodStatus::Committed,
                eligibility_root: eligibility_root.clone(),
                eligible_count,
                committed_height: U64(env::block_height()),
                seed: None,
                reserved_yield: U128(0),
                reserved_bonus: U128(0),
                allocation_root: None,
                allocated_total: U128(0),
                claimed_amount: U128(0),
                claimable_after: U64(0),
                claim_deadline: U64(0),
            },
        );
        self.periods.flush();
        crate::funding::charge_storage(before, &env::predecessor_account_id());
        events::emit(
            "period_committed",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("eligibility_root", &eligibility_root),
                ("eligible_count", &eligible_count.to_string()),
            ]),
        );
    }

    /// Moves unreserved liquid funds into a period's reserve. The operator is capped by the
    /// sponsor-set per-period limit; the sponsor is not.
    pub fn reserve_for_period(&mut self, campaign_id: U64, period_id: u32, from_yield: U128, from_bonus: U128) {
        self.assert_inflows_open();
        let caller = env::predecessor_account_id();
        let key = (campaign_id.0, period_id);
        let period = self.periods.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(
            period.status == PeriodStatus::Committed || period.status == PeriodStatus::Vetoed,
            "ERR_PERIOD_NOT_OPEN"
        );
        let is_operator = caller == self.operator_id;
        let c = self.campaign_mut(campaign_id.0);
        require!(is_operator || c.sponsor == caller, "ERR_NOT_SPONSOR_OR_OPERATOR");
        let add = from_yield.0 + from_bonus.0;
        require!(add > 0, "ERR_ZERO_AMOUNT");
        if is_operator {
            let after = period.reserved_yield.0 + period.reserved_bonus.0 + add;
            require!(after <= c.max_operator_reserve_per_period.0, "ERR_OPERATOR_RESERVE_CAP");
        }
        require!(from_yield.0 <= c.yield_available.0, "ERR_INSUFFICIENT_YIELD");
        require!(from_bonus.0 <= c.bonus_available.0, "ERR_INSUFFICIENT_BONUS");
        c.yield_available = U128(c.yield_available.0 - from_yield.0);
        c.bonus_available = U128(c.bonus_available.0 - from_bonus.0);
        c.reserved = U128(c.reserved.0 + add);
        let p = self.periods.get_mut(&key).unwrap();
        p.reserved_yield = U128(p.reserved_yield.0 + from_yield.0);
        p.reserved_bonus = U128(p.reserved_bonus.0 + from_bonus.0);
        events::emit(
            "funds_reserved",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("from_yield", &from_yield.0.to_string()),
                ("from_bonus", &from_bonus.0.to_string()),
            ]),
        );
    }

    /// Records the block's random seed for a random-draw period. Must be in a strictly later
    /// block than the eligibility commitment, and can be recorded exactly once.
    pub fn record_seed(&mut self, campaign_id: U64, period_id: u32) -> String {
        self.assert_operator_or_sponsor(campaign_id.0);
        require!(self.campaign(campaign_id.0).random_enabled, "ERR_RANDOM_NOT_ENABLED");
        let p = self.periods.get_mut(&(campaign_id.0, period_id)).unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(p.status == PeriodStatus::Committed, "ERR_PERIOD_NOT_OPEN");
        require!(p.seed.is_none(), "ERR_SEED_ALREADY_RECORDED");
        require!(env::block_height() > p.committed_height.0, "ERR_SEED_SAME_BLOCK_AS_COMMIT");
        let seed = hex::encode(env::random_seed_array());
        p.seed = Some(seed.clone());
        events::emit(
            "seed_recorded",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("seed", &seed),
                ("block_height", &env::block_height().to_string()),
            ]),
        );
        seed
    }

    /// Publishes the allocation Merkle root. `allocated_total` must not exceed the reserve;
    /// any unallocated reserve returns to the campaign's available balances immediately.
    /// Claims open only after the dispute window.
    pub fn finalize_period(
        &mut self,
        campaign_id: U64,
        period_id: u32,
        allocation_root: String,
        allocated_total: U128,
        claim_window_ns: U64,
    ) {
        self.assert_inflows_open();
        let caller = env::predecessor_account_id();
        let _ = parse_hex32(&allocation_root);
        require!(claim_window_ns.0 >= MIN_CLAIM_WINDOW_NS, "ERR_CLAIM_WINDOW_TOO_SHORT");
        let (sponsor, require_sponsor, random) = {
            let c = self.campaign(campaign_id.0);
            (c.sponsor.clone(), c.require_sponsor_finalize, c.random_enabled)
        };
        if require_sponsor {
            require!(caller == sponsor, "ERR_SPONSOR_MUST_FINALIZE");
        } else {
            require!(caller == sponsor || caller == self.operator_id, "ERR_NOT_SPONSOR_OR_OPERATOR");
        }
        let key = (campaign_id.0, period_id);
        let dispute = self.dispute_window_ns;
        let p = self.periods.get_mut(&key).unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(p.status == PeriodStatus::Committed || p.status == PeriodStatus::Vetoed, "ERR_PERIOD_NOT_OPEN");
        if random {
            require!(p.seed.is_some(), "ERR_SEED_REQUIRED");
        }
        let reserved = p.reserved_yield.0 + p.reserved_bonus.0;
        require!(allocated_total.0 > 0, "ERR_ZERO_ALLOCATION");
        require!(allocated_total.0 <= reserved, "ERR_ALLOCATION_EXCEEDS_RESERVE");
        // Return unallocated reserve. Yield is consumed before bonus, so bonus returns first.
        let excess = reserved - allocated_total.0;
        let bonus_back = excess.min(p.reserved_bonus.0);
        let yield_back = excess - bonus_back;
        p.reserved_bonus = U128(p.reserved_bonus.0 - bonus_back);
        p.reserved_yield = U128(p.reserved_yield.0 - yield_back);
        p.allocation_root = Some(allocation_root.clone());
        p.allocated_total = allocated_total;
        p.status = PeriodStatus::Finalized;
        let now = env::block_timestamp();
        p.claimable_after = U64(now + dispute);
        p.claim_deadline = U64(now + dispute + claim_window_ns.0);
        let c = self.campaign_mut(campaign_id.0);
        c.reserved = U128(c.reserved.0 - excess);
        c.bonus_available = U128(c.bonus_available.0 + bonus_back);
        c.yield_available = U128(c.yield_available.0 + yield_back);
        events::emit(
            "period_finalized",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("allocation_root", &allocation_root),
                ("allocated_total", &allocated_total.0.to_string()),
                ("claimable_after", &(now + dispute).to_string()),
                ("bonus_returned", &bonus_back.to_string()),
                ("yield_returned", &yield_back.to_string()),
            ]),
        );
    }

    /// Sponsor or guardian rejects a finalized allocation during the dispute window.
    /// The reserve stays locked for the period so a corrected root can be published.
    pub fn veto_period(&mut self, campaign_id: U64, period_id: u32, reason: String) {
        let caller = env::predecessor_account_id();
        let sponsor = self.campaign(campaign_id.0).sponsor.clone();
        require!(caller == sponsor || caller == self.guardian_id, "ERR_NOT_SPONSOR_OR_GUARDIAN");
        require!(reason.len() <= 280, "ERR_REASON_TOO_LONG");
        let p = self.periods.get_mut(&(campaign_id.0, period_id)).unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(p.status == PeriodStatus::Finalized, "ERR_NOT_FINALIZED");
        require!(env::block_timestamp() < p.claimable_after.0, "ERR_DISPUTE_WINDOW_OVER");
        p.status = PeriodStatus::Vetoed;
        p.allocation_root = None;
        p.allocated_total = U128(0);
        events::emit(
            "period_vetoed",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("by", caller.as_str()),
                ("reason", &reason),
            ]),
        );
    }

    /// Claims an allocation. The claimant must BE the account in the Merkle leaf, so a
    /// claim cannot be redirected or replayed. Attach enough NEAR for the claim record's
    /// storage (excess refunded).
    #[payable]
    pub fn claim(&mut self, campaign_id: U64, period_id: u32, amount: U128, proof: Vec<String>) -> Promise {
        let account = env::predecessor_account_id();
        self.internal_claim(campaign_id, period_id, account.clone(), amount, proof, account)
    }

    /// Pays an allocation to the account named in the Merkle leaf, on its behalf (auto-payout by a relayer).
    /// Funds can only ever go to that account; the caller only covers the claim record's storage.
    #[payable]
    pub fn claim_for(&mut self, campaign_id: U64, period_id: u32, account_id: AccountId, amount: U128, proof: Vec<String>) -> Promise {
        let payer = env::predecessor_account_id();
        self.internal_claim(campaign_id, period_id, account_id, amount, proof, payer)
    }

    fn internal_claim(&mut self, campaign_id: U64, period_id: u32, account: AccountId, amount: U128, proof: Vec<String>, payer: AccountId) -> Promise {
        self.assert_not_fully_paused();
        let key = (campaign_id.0, period_id);
        let p = self.periods.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(p.status == PeriodStatus::Finalized, "ERR_NOT_CLAIMABLE");
        let now = env::block_timestamp();
        require!(now >= p.claimable_after.0, "ERR_DISPUTE_WINDOW_ACTIVE");
        require!(now <= p.claim_deadline.0, "ERR_CLAIM_EXPIRED");
        require!(proof.len() <= 40, "ERR_PROOF_TOO_LONG");
        let root = parse_hex32(p.allocation_root.as_ref().unwrap());
        let proof: Vec<merkle::Hash> = proof.iter().map(|h| parse_hex32(h)).collect();
        let leaf = leaf_hash(campaign_id.0, period_id, account.as_str(), amount.0);
        require!(verify(leaf, &proof, &root), "ERR_INVALID_PROOF");
        let claim_key = (campaign_id.0, period_id, account.clone());
        require!(!self.claimed.contains(&claim_key), "ERR_ALREADY_CLAIMED");
        require!(p.claimed_amount.0 + amount.0 <= p.allocated_total.0, "ERR_PERIOD_OVERCLAIMED");

        let before = env::storage_usage();
        self.claimed.insert(claim_key);
        crate::funding::charge_storage(before, &payer);

        let pm = self.periods.get_mut(&key).unwrap();
        pm.claimed_amount = U128(pm.claimed_amount.0 + amount.0);
        let c = self.campaign_mut(campaign_id.0);
        c.reserved = U128(c.reserved.0 - amount.0);
        c.claimed_total = U128(c.claimed_total.0 + amount.0);
        self.liquid_tracked -= amount.0;
        events::emit(
            "claim_started",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("account_id", account.as_str()),
                ("amount", &amount.0.to_string()),
            ]),
        );
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(account.clone(), amount, Some(format!("yielvy reward c{} p{}", campaign_id.0, period_id)))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_claim_transferred(campaign_id, period_id, account, amount),
            )
    }

    #[private]
    pub fn on_claim_transferred(
        &mut self,
        campaign_id: U64,
        period_id: u32,
        account_id: AccountId,
        amount: U128,
        #[callback_result] r: Result<(), PromiseError>,
    ) -> bool {
        if r.is_ok() {
            events::emit(
                "claim_confirmed",
                &serde_json_obj(&[
                    ("campaign_id", &campaign_id.0.to_string()),
                    ("period_id", &period_id.to_string()),
                    ("account_id", account_id.as_str()),
                    ("amount", &amount.0.to_string()),
                ]),
            );
            return true;
        }
        // Transfer failed (e.g. recipient not registered with the token): undo everything so
        // the user can register storage and claim again.
        self.claimed.remove(&(campaign_id.0, period_id, account_id.clone()));
        let pm = self.periods.get_mut(&(campaign_id.0, period_id)).unwrap();
        pm.claimed_amount = U128(pm.claimed_amount.0 - amount.0);
        let c = self.campaign_mut(campaign_id.0);
        c.reserved = U128(c.reserved.0 + amount.0);
        c.claimed_total = U128(c.claimed_total.0 - amount.0);
        self.liquid_tracked += amount.0;
        events::emit(
            "claim_failed",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("account_id", account_id.as_str()),
                ("amount", &amount.0.to_string()),
            ]),
        );
        false
    }

    /// After the claim deadline, returns unclaimed allocations to the campaign. Anyone may call.
    pub fn close_period(&mut self, campaign_id: U64, period_id: u32) {
        let key = (campaign_id.0, period_id);
        let p = self.periods.get_mut(&key).unwrap_or_else(|| env::panic_str("ERR_NO_PERIOD"));
        require!(p.status == PeriodStatus::Finalized, "ERR_NOT_FINALIZED");
        require!(env::block_timestamp() > p.claim_deadline.0, "ERR_CLAIM_WINDOW_OPEN");
        let unclaimed = p.allocated_total.0 - p.claimed_amount.0;
        // Claims consumed yield first, so leftover maps back to bonus first, then yield.
        let consumed_yield = p.claimed_amount.0.min(p.reserved_yield.0);
        let consumed_bonus = p.claimed_amount.0 - consumed_yield;
        let bonus_back = p.reserved_bonus.0 - consumed_bonus;
        let yield_back = unclaimed - bonus_back;
        p.status = PeriodStatus::Closed;
        let c = self.campaign_mut(campaign_id.0);
        c.reserved = U128(c.reserved.0 - unclaimed);
        c.bonus_available = U128(c.bonus_available.0 + bonus_back);
        c.yield_available = U128(c.yield_available.0 + yield_back);
        events::emit(
            "period_closed",
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.0.to_string()),
                ("period_id", &period_id.to_string()),
                ("returned", &unclaimed.to_string()),
                ("bonus_returned", &bonus_back.to_string()),
                ("yield_returned", &yield_back.to_string()),
            ]),
        );
    }
}
