//! RHEA lending integration.
//!
//! Supply:   token.ft_transfer_call(lending, amount, msg="")   — plain supply, NOT collateral
//! Withdraw: lending.execute([Withdraw{token_id, max_amount}])  — 1 yoctoNEAR, internal units
//!
//! All RHEA operations are serialized through `pending_op`, so every change in the vault's
//! RHEA share balance is attributable to exactly one campaign. Results are never taken
//! from operator input: the vault reads RHEA's own state (get_account / get_asset) and
//! the token contract's resolved transfer amount.
//!
//! Withdrawals are two-phase because RHEA sends tokens with a detached ft_transfer:
//!   1. request_*  -> lending.execute(Withdraw)          (lock held)
//!   2. reconcile_pending (after the tx is final)        -> measures share delta via views,
//!      cross-checks it against RHEA's share price, and only then credits tokens.
use crate::*;
use near_sdk::{Promise, PromiseError, PromiseOrValue};

/// Blocks to wait after a withdrawal before it may be reconciled (detached receipts).
pub const RECONCILE_MIN_BLOCKS: u64 = 6;
/// Allowed deviation between measured and expected share movement (basis points).
pub const SHARE_TOLERANCE_BPS: u128 = 100;

#[near]
impl Vault {
    // ------------------------------------------------------------------ supply

    /// Supplies idle principal of a campaign to RHEA. Operator or sponsor.
    pub fn supply(&mut self, campaign_id: U64, amount: U128) -> Promise {
        self.assert_inflows_open();
        self.assert_operator_or_sponsor(campaign_id.0);
        require!(self.pending_op.is_none(), "ERR_OPERATION_IN_PROGRESS");
        require!(env::prepaid_gas() >= Gas::from_tgas(250), "ERR_NEED_250_TGAS");
        require!(amount.0 > 0, "ERR_ZERO_AMOUNT");
        let c = self.campaign_mut(campaign_id.0);
        require!(c.status == CampaignStatus::Active, "ERR_CAMPAIGN_NOT_ACTIVE");
        require!(amount.0 <= c.principal_idle.0, "ERR_EXCEEDS_IDLE_PRINCIPAL");
        c.principal_idle = U128(c.principal_idle.0 - amount.0);
        self.liquid_tracked -= amount.0;
        let op = self.start_op(campaign_id.0, OpPurpose::Supply, amount.0);
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER_CALL)
            .ft_transfer_call(self.lending_id.clone(), amount, None, String::new())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(80))
                    .on_supply_transferred(op),
            )
    }

    /// Token contract resolved the transfer. `used` is authoritative (NEP-141 ft_resolve_transfer).
    #[private]
    pub fn on_supply_transferred(&mut self, op_id: U64, #[callback_result] used: Result<U128, PromiseError>) -> Promise {
        let op = self.expect_op(op_id);
        // If ft_transfer_call itself failed, no tokens moved.
        let used = used.map(|u| u.0).unwrap_or(0).min(op.amount.0);
        let refunded = op.amount.0 - used;
        if refunded > 0 {
            let c = self.campaign_mut(op.campaign_id.0);
            c.principal_idle = U128(c.principal_idle.0 + refunded);
            self.liquid_tracked += refunded;
        }
        // Record how much actually entered RHEA; shares are measured next.
        if let Some(p) = self.pending_op.as_mut() {
            p.amount = U128(used);
        }
        self.measure(op_id)
    }

    // ------------------------------------------------------------------ yield harvesting

    /// Harvests realized yield: reads RHEA's share price, computes this campaign's position
    /// value, and withdraws only value above principal + safety buffer. Operator or sponsor.
    pub fn harvest_yield(&mut self, campaign_id: U64, min_amount: U128) -> Promise {
        self.assert_inflows_open();
        self.assert_operator_or_sponsor(campaign_id.0);
        require!(self.pending_op.is_none(), "ERR_OPERATION_IN_PROGRESS");
        require!(env::prepaid_gas() >= Gas::from_tgas(200), "ERR_NEED_200_TGAS");
        let c = self.campaign(campaign_id.0);
        require!(c.rhea_shares.0 > 0, "ERR_NO_POSITION");
        let op = self.start_op(campaign_id.0, OpPurpose::HarvestYield, 0);
        ext_lending::ext(self.lending_id.clone())
            .with_static_gas(GAS_VIEW)
            .get_asset(self.token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(150))
                    .on_asset_for_withdraw(op, min_amount),
            )
    }

    /// Sponsor redeems principal from RHEA back to principal_idle (exit flow).
    /// `amount` in token units; capped at the campaign's current position value.
    pub fn redeem_principal(&mut self, campaign_id: U64, amount: U128) -> Promise {
        self.assert_not_fully_paused();
        let caller = env::predecessor_account_id();
        let c = self.campaign(campaign_id.0);
        require!(c.sponsor == caller || caller == self.operator_id, "ERR_NOT_SPONSOR_OR_OPERATOR");
        require!(self.pending_op.is_none(), "ERR_OPERATION_IN_PROGRESS");
        require!(env::prepaid_gas() >= Gas::from_tgas(200), "ERR_NEED_200_TGAS");
        require!(c.rhea_shares.0 > 0, "ERR_NO_POSITION");
        require!(amount.0 > 0, "ERR_ZERO_AMOUNT");
        let op = self.start_op(campaign_id.0, OpPurpose::RedeemPrincipal, amount.0);
        ext_lending::ext(self.lending_id.clone())
            .with_static_gas(GAS_VIEW)
            .get_asset(self.token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(150))
                    .on_asset_for_withdraw(op, U128(0)),
            )
    }

    #[private]
    pub fn on_asset_for_withdraw(
        &mut self,
        op_id: U64,
        min_amount: U128,
        #[callback_result] asset: Result<Option<LendingAssetView>, PromiseError>,
    ) -> PromiseOrValue<bool> {
        let op = self.expect_op(op_id);
        let asset = match asset {
            Ok(Some(a)) => a,
            _ => return self.abort_op("lending_asset_unavailable"),
        };
        if !asset.config.can_withdraw {
            return self.abort_op("lending_withdraw_disabled");
        }
        require!(asset.config.extra_decimals == self.extra_decimals, "ERR_EXTRA_DECIMALS_CHANGED");
        let c = self.campaign(op.campaign_id.0).clone();
        let unit = 10u128.pow(self.extra_decimals as u32);
        let value_internal = mul_div(c.rhea_shares.0, asset.supplied.balance.0, asset.supplied.shares.0);
        // One token unit margin so rounding can never burn another campaign's shares.
        let value_tokens = (value_internal / unit).saturating_sub(1);
        let request_tokens = match op.purpose {
            OpPurpose::HarvestYield => {
                let protected = c.principal_supplied.0 + c.principal_supplied.0 * self.safety_buffer_bps as u128 / 10_000;
                let excess = value_tokens.saturating_sub(protected);
                if excess == 0 || excess < min_amount.0 {
                    return self.abort_op("no_harvestable_yield");
                }
                excess
            }
            OpPurpose::RedeemPrincipal => op.amount.0.min(value_tokens),
            OpPurpose::Supply => env::panic_str("ERR_WRONG_OP"),
        };
        if request_tokens == 0 {
            return self.abort_op("nothing_to_withdraw");
        }
        // Available liquidity in the market (supplied - borrowed); RHEA would panic otherwise.
        let liquidity_internal = asset.supplied.balance.0.saturating_sub(asset.borrowed.balance.0);
        if request_tokens * unit > liquidity_internal {
            return self.abort_op("insufficient_lending_liquidity");
        }
        if let Some(p) = self.pending_op.as_mut() {
            p.amount = U128(request_tokens);
            p.started_height = U64(env::block_height());
        }
        events::emit(
            "withdraw_requested",
            &serde_json_obj(&[
                ("op_id", &op_id.0.to_string()),
                ("campaign_id", &op.campaign_id.0.to_string()),
                ("amount", &request_tokens.to_string()),
            ]),
        );
        let p = ext_lending::ext(self.lending_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_LENDING_EXECUTE)
            .execute(vec![LendingAction::Withdraw {
                token_id: self.token_id.clone(),
                max_amount: U128(request_tokens * unit),
            }]);
        PromiseOrValue::Promise(p)
    }

    // ------------------------------------------------------------------ reconciliation

    /// Measures the vault's RHEA position and applies the in-flight op's result.
    /// Anyone may call it; the outcome depends only on chain state.
    pub fn reconcile_pending(&mut self) -> Promise {
        let op = self.pending_op.clone().unwrap_or_else(|| env::panic_str("ERR_NO_PENDING_OP"));
        require!(op.purpose != OpPurpose::Supply || env::block_height() > op.started_height.0, "ERR_TOO_EARLY");
        if op.purpose != OpPurpose::Supply {
            require!(env::block_height() >= op.started_height.0 + RECONCILE_MIN_BLOCKS, "ERR_TOO_EARLY");
        }
        self.measure(op.op_id)
    }

    #[private]
    pub fn on_measured(
        &mut self,
        op_id: U64,
        #[callback_result] account: Result<Option<LendingAccountView>, PromiseError>,
        #[callback_result] asset: Result<Option<LendingAssetView>, PromiseError>,
    ) -> bool {
        let op = self.expect_op(op_id);
        let (account, asset) = match (account, asset) {
            (Ok(acc), Ok(Some(asset))) => (acc, asset),
            _ => {
                // Views failed; keep the lock so the op can be reconciled again.
                events::emit("reconcile_retry", &serde_json_obj(&[("op_id", &op_id.0.to_string())]));
                return false;
            }
        };
        let shares_now = account
            .and_then(|a| a.supplied.into_iter().find(|s| s.token_id == self.token_id))
            .map(|s| s.shares.0)
            .unwrap_or(0);
        let unit = 10u128.pow(self.extra_decimals as u32);
        match op.purpose {
            OpPurpose::Supply => {
                require!(shares_now >= self.total_rhea_shares, "ERR_SHARES_DECREASED_DURING_SUPPLY");
                let minted = shares_now - self.total_rhea_shares;
                let used = op.amount.0;
                if used == 0 {
                    self.pending_op = None;
                    events::emit("supply_refunded", &serde_json_obj(&[("op_id", &op_id.0.to_string())]));
                    return false;
                }
                let expected = mul_div(used * unit, asset.supplied.shares.0, asset.supplied.balance.0);
                if !within_tolerance(minted, expected) {
                    return self.flag_review(op_id, "supply_share_mismatch");
                }
                let c = self.campaign_mut(op.campaign_id.0);
                c.rhea_shares = U128(c.rhea_shares.0 + minted);
                c.principal_supplied = U128(c.principal_supplied.0 + used);
                self.total_rhea_shares += minted;
                self.pending_op = None;
                events::emit(
                    "supplied",
                    &serde_json_obj(&[
                        ("op_id", &op_id.0.to_string()),
                        ("campaign_id", &op.campaign_id.0.to_string()),
                        ("amount", &used.to_string()),
                        ("shares", &minted.to_string()),
                    ]),
                );
                true
            }
            OpPurpose::HarvestYield | OpPurpose::RedeemPrincipal => {
                if shares_now >= self.total_rhea_shares {
                    // Withdrawal failed or was reverted by RHEA (transfer failure re-credits shares).
                    self.pending_op = None;
                    events::emit("withdraw_not_executed", &serde_json_obj(&[("op_id", &op_id.0.to_string())]));
                    return false;
                }
                let burned = self.total_rhea_shares - shares_now;
                let received = op.amount.0;
                let expected = mul_div(received * unit, asset.supplied.shares.0, asset.supplied.balance.0);
                if !within_tolerance(burned, expected) {
                    return self.flag_review(op_id, "withdraw_share_mismatch");
                }
                let fee_bps = self.fee_bps as u128;
                let c = self.campaign_mut(op.campaign_id.0);
                require!(burned <= c.rhea_shares.0, "ERR_BURNED_MORE_THAN_CAMPAIGN_SHARES");
                c.rhea_shares = U128(c.rhea_shares.0 - burned);
                // Split received tokens into principal return and realized yield.
                let (principal_part, yield_part) = match op.purpose {
                    OpPurpose::HarvestYield => (0, received),
                    _ => {
                        let p = received.min(c.principal_supplied.0);
                        // If the whole position is gone, any remainder is yield.
                        (p, received - p)
                    }
                };
                // Full exit: remaining principal basis with zero shares is a realized loss.
                c.principal_supplied = U128(c.principal_supplied.0 - principal_part);
                let mut loss = 0u128;
                if c.rhea_shares.0 == 0 && c.principal_supplied.0 > 0 {
                    loss = c.principal_supplied.0;
                    c.principal_supplied = U128(0);
                }
                c.principal_idle = U128(c.principal_idle.0 + principal_part);
                let fee = yield_part * fee_bps / 10_000;
                c.yield_available = U128(c.yield_available.0 + yield_part - fee);
                c.yield_realized_total = U128(c.yield_realized_total.0 + yield_part - fee);
                self.fees_accrued += fee;
                self.total_rhea_shares -= burned;
                self.liquid_tracked += received;
                self.pending_op = None;
                events::emit(
                    "withdraw_settled",
                    &serde_json_obj(&[
                        ("op_id", &op_id.0.to_string()),
                        ("campaign_id", &op.campaign_id.0.to_string()),
                        ("received", &received.to_string()),
                        ("principal", &principal_part.to_string()),
                        ("yield", &(yield_part - fee).to_string()),
                        ("fee", &fee.to_string()),
                        ("loss", &loss.to_string()),
                        ("shares_burned", &burned.to_string()),
                    ]),
                );
                true
            }
        }
    }

    /// Guardian/owner releases an op flagged for review AFTER manual investigation,
    /// choosing to apply nothing. It can never credit or move funds.
    pub fn clear_flagged_op(&mut self, op_id: U64) {
        let c = env::predecessor_account_id();
        require!(c == self.guardian_id || c == self.owner_id, "ERR_NOT_GUARDIAN");
        let op = self.expect_op(op_id);
        require!(self.pause.inflows, "ERR_MUST_PAUSE_FIRST");
        events::emit("flagged_op_cleared", &serde_json_obj(&[("op_id", &op.op_id.0.to_string()), ("by", c.as_str())]));
        self.pending_op = None;
    }
}

impl Vault {
    pub(crate) fn start_op(&mut self, campaign_id: u64, purpose: OpPurpose, amount: u128) -> U64 {
        let id = self.next_op_id;
        self.next_op_id += 1;
        self.pending_op = Some(PendingOp {
            op_id: U64(id),
            campaign_id: U64(campaign_id),
            purpose,
            amount: U128(amount),
            started_at: U64(env::block_timestamp()),
            started_height: U64(env::block_height()),
        });
        U64(id)
    }

    pub(crate) fn expect_op(&self, op_id: U64) -> PendingOp {
        let op = self.pending_op.clone().unwrap_or_else(|| env::panic_str("ERR_NO_PENDING_OP"));
        require!(op.op_id == op_id, "ERR_OP_MISMATCH");
        op
    }

    fn abort_op(&mut self, reason: &str) -> PromiseOrValue<bool> {
        if let Some(op) = self.pending_op.take() {
            events::emit("op_aborted", &serde_json_obj(&[("op_id", &op.op_id.0.to_string()), ("reason", reason)]));
        }
        PromiseOrValue::Value(false)
    }

    fn flag_review(&mut self, op_id: U64, reason: &str) -> bool {
        // Keep the lock: no further RHEA ops until a human investigates. Pause inflows.
        self.pause.inflows = true;
        events::emit("op_flagged", &serde_json_obj(&[("op_id", &op_id.0.to_string()), ("reason", reason)]));
        false
    }

    fn measure(&self, op_id: U64) -> Promise {
        let me = env::current_account_id();
        ext_lending::ext(self.lending_id.clone())
            .with_static_gas(GAS_VIEW)
            .get_account(me.clone())
            .and(ext_lending::ext(self.lending_id.clone()).with_static_gas(GAS_VIEW).get_asset(self.token_id.clone()))
            .then(Self::ext(me).with_static_gas(GAS_CALLBACK_WITH_MEASURE).on_measured(op_id))
    }

    pub(crate) fn assert_operator_or_sponsor(&self, campaign_id: u64) {
        let caller = env::predecessor_account_id();
        let c = self.campaign(campaign_id);
        require!(caller == self.operator_id || caller == c.sponsor, "ERR_NOT_SPONSOR_OR_OPERATOR");
    }
}

pub(crate) fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    require!(d > 0, "ERR_DIV_ZERO");
    let r = U256::from(a) * U256::from(b) / U256::from(d);
    r.as_u128()
}

fn within_tolerance(actual: u128, expected: u128) -> bool {
    if expected == 0 {
        return actual == 0;
    }
    let diff = actual.abs_diff(expected);
    // diff / expected <= tolerance  (computed without overflow)
    mul_div(diff, 10_000, expected) <= SHARE_TOLERANCE_BPS
}

/// Minimal 256-bit unsigned integer for mul-div without overflow.
#[derive(Clone, Copy)]
pub(crate) struct U256 {
    hi: u128,
    lo: u128,
}

impl U256 {
    fn from(v: u128) -> Self {
        U256 { hi: 0, lo: v }
    }
    fn as_u128(self) -> u128 {
        require!(self.hi == 0, "ERR_OVERFLOW");
        self.lo
    }
}

impl core::ops::Mul for U256 {
    type Output = U256;
    fn mul(self, o: U256) -> U256 {
        require!(self.hi == 0 && o.hi == 0, "ERR_OVERFLOW");
        let (a1, a0) = (self.lo >> 64, self.lo & u64::MAX as u128);
        let (b1, b0) = (o.lo >> 64, o.lo & u64::MAX as u128);
        let p00 = a0 * b0;
        let p01 = a0 * b1;
        let p10 = a1 * b0;
        let p11 = a1 * b1;
        let mid = (p00 >> 64) + (p01 & u64::MAX as u128) + (p10 & u64::MAX as u128);
        let lo = (p00 & u64::MAX as u128) | (mid << 64);
        let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
        U256 { hi, lo }
    }
}

impl core::ops::Div for U256 {
    type Output = U256;
    /// Long division by a 128-bit divisor (o.hi must be 0).
    fn div(self, o: U256) -> U256 {
        require!(o.hi == 0 && o.lo != 0, "ERR_DIV");
        let d = o.lo;
        let mut q_hi: u128 = 0;
        let mut q_lo: u128 = 0;
        let mut rem: u128 = 0;
        for i in (0..256).rev() {
            let bit = if i >= 128 { (self.hi >> (i - 128)) & 1 } else { (self.lo >> i) & 1 };
            let overflow = rem >> 127 == 1;
            rem = (rem << 1) | bit;
            if overflow || rem >= d {
                rem = rem.wrapping_sub(d);
                if i >= 128 {
                    q_hi |= 1 << (i - 128);
                } else {
                    q_lo |= 1 << i;
                }
            }
        }
        U256 { hi: q_hi, lo: q_lo }
    }
}
