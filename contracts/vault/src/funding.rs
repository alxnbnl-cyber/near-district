//! Campaign registration, sponsor funding (NEP-141 ft_transfer_call) and sponsor exits.
use crate::*;
use near_sdk::{Promise, PromiseOrValue};

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", tag = "action", rename_all = "snake_case")]
enum FundMsg {
    FundPrincipal { campaign_id: U64 },
    FundBonus { campaign_id: U64 },
}

#[near]
impl Vault {
    /// Registers a campaign owned by the caller. The caller pays for its storage;
    /// any excess deposit is refunded.
    #[payable]
    pub fn create_campaign(
        &mut self,
        max_operator_reserve_per_period: U128,
        require_sponsor_finalize: bool,
        random_enabled: bool,
    ) -> U64 {
        self.assert_inflows_open();
        let before = env::storage_usage();
        let id = self.next_campaign_id;
        self.next_campaign_id += 1;
        let sponsor = env::predecessor_account_id();
        self.campaigns.insert(
            id,
            Campaign {
                sponsor: sponsor.clone(),
                status: CampaignStatus::Active,
                principal_idle: U128(0),
                principal_supplied: U128(0),
                rhea_shares: U128(0),
                yield_available: U128(0),
                bonus_available: U128(0),
                reserved: U128(0),
                claimed_total: U128(0),
                yield_realized_total: U128(0),
                max_operator_reserve_per_period,
                require_sponsor_finalize,
                random_enabled,
                created_at: U64(env::block_timestamp()),
            },
        );
        self.campaigns.flush();
        charge_storage(before, &sponsor);
        events::emit(
            "campaign_created",
            &serde_json_obj(&[("campaign_id", &id.to_string()), ("sponsor", sponsor.as_str())]),
        );
        U64(id)
    }

    /// NEP-141 receiver. Accepts ONLY the allowlisted token and ONLY from the campaign sponsor.
    /// Panicking here makes the token contract refund the full amount to the sender.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.token_id, "ERR_TOKEN_NOT_ALLOWED");
        self.assert_inflows_open();
        require!(amount.0 > 0, "ERR_ZERO_AMOUNT");
        let parsed: FundMsg = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("ERR_INVALID_MSG"));
        let (campaign_id, is_bonus) = match parsed {
            FundMsg::FundPrincipal { campaign_id } => (campaign_id.0, false),
            FundMsg::FundBonus { campaign_id } => (campaign_id.0, true),
        };
        let c = self.campaign_mut(campaign_id);
        require!(c.sponsor == sender_id, "ERR_ONLY_SPONSOR_CAN_FUND");
        require!(c.status == CampaignStatus::Active, "ERR_CAMPAIGN_NOT_ACTIVE");
        if is_bonus {
            c.bonus_available = U128(c.bonus_available.0 + amount.0);
        } else {
            c.principal_idle = U128(c.principal_idle.0 + amount.0);
        }
        self.liquid_tracked += amount.0;
        events::emit(
            if is_bonus { "bonus_funded" } else { "principal_funded" },
            &serde_json_obj(&[
                ("campaign_id", &campaign_id.to_string()),
                ("sponsor", sender_id.as_str()),
                ("amount", &amount.0.to_string()),
            ]),
        );
        PromiseOrValue::Value(U128(0))
    }

    /// Sponsor starts wind-down: no new reward periods. Existing periods run to their
    /// claim deadline; their reserves stay locked for participants.
    pub fn begin_wind_down(&mut self, campaign_id: U64) {
        let caller = env::predecessor_account_id();
        let c = self.campaign_mut(campaign_id.0);
        require!(c.sponsor == caller, "ERR_NOT_SPONSOR");
        c.status = CampaignStatus::Closing;
        events::emit("wind_down_started", &serde_json_obj(&[("campaign_id", &campaign_id.0.to_string())]));
    }

    /// Sponsor withdraws its own unreserved liquid funds.
    ///   principal_idle  : any time (principal is the sponsor's; yield was never promised)
    ///   yield / bonus   : only after begin_wind_down, so live participants are not rugged
    /// Reserved funds can never be withdrawn by the sponsor.
    pub fn sponsor_withdraw(&mut self, campaign_id: U64, principal: U128, yield_amount: U128, bonus: U128) -> Promise {
        self.assert_not_fully_paused();
        let caller = env::predecessor_account_id();
        let c = self.campaign_mut(campaign_id.0);
        require!(c.sponsor == caller, "ERR_NOT_SPONSOR");
        require!(principal.0 <= c.principal_idle.0, "ERR_EXCEEDS_IDLE_PRINCIPAL");
        if yield_amount.0 > 0 || bonus.0 > 0 {
            require!(c.status == CampaignStatus::Closing, "ERR_WIND_DOWN_REQUIRED");
        }
        require!(yield_amount.0 <= c.yield_available.0, "ERR_EXCEEDS_AVAILABLE_YIELD");
        require!(bonus.0 <= c.bonus_available.0, "ERR_EXCEEDS_AVAILABLE_BONUS");
        let total = principal.0 + yield_amount.0 + bonus.0;
        require!(total > 0, "ERR_ZERO_AMOUNT");
        c.principal_idle = U128(c.principal_idle.0 - principal.0);
        c.yield_available = U128(c.yield_available.0 - yield_amount.0);
        c.bonus_available = U128(c.bonus_available.0 - bonus.0);
        self.liquid_tracked -= total;
        events::emit(
            "sponsor_withdraw_started",
            &serde_json_obj(&[("campaign_id", &campaign_id.0.to_string()), ("amount", &total.to_string())]),
        );
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(caller, U128(total), Some(format!("yielvy campaign {} withdrawal", campaign_id.0)))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_sponsor_withdraw(campaign_id, principal, yield_amount, bonus),
            )
    }

    #[private]
    pub fn on_sponsor_withdraw(
        &mut self,
        campaign_id: U64,
        principal: U128,
        yield_amount: U128,
        bonus: U128,
        #[callback_result] r: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        if r.is_ok() {
            events::emit(
                "sponsor_withdraw_confirmed",
                &serde_json_obj(&[
                    ("campaign_id", &campaign_id.0.to_string()),
                    ("principal", &principal.0.to_string()),
                    ("yield", &yield_amount.0.to_string()),
                    ("bonus", &bonus.0.to_string()),
                ]),
            );
            return true;
        }
        // Transfer failed: restore every bucket exactly.
        let c = self.campaign_mut(campaign_id.0);
        c.principal_idle = U128(c.principal_idle.0 + principal.0);
        c.yield_available = U128(c.yield_available.0 + yield_amount.0);
        c.bonus_available = U128(c.bonus_available.0 + bonus.0);
        self.liquid_tracked += principal.0 + yield_amount.0 + bonus.0;
        events::emit("sponsor_withdraw_failed", &serde_json_obj(&[("campaign_id", &campaign_id.0.to_string())]));
        false
    }

    /// Sponsor may lower or raise the operator's per-period reservation cap at any time.
    pub fn set_operator_reserve_cap(&mut self, campaign_id: U64, max_operator_reserve_per_period: U128) {
        let caller = env::predecessor_account_id();
        let c = self.campaign_mut(campaign_id.0);
        require!(c.sponsor == caller, "ERR_NOT_SPONSOR");
        c.max_operator_reserve_per_period = max_operator_reserve_per_period;
    }
}

/// Charges the storage delta to `payer` from the attached deposit and refunds any excess.
pub(crate) fn charge_storage(before: u64, payer: &AccountId) {
    let after = env::storage_usage();
    let used = after.saturating_sub(before) as u128;
    let cost = env::storage_byte_cost().saturating_mul(used);
    let attached = env::attached_deposit();
    require!(attached >= cost, format!("ERR_STORAGE_DEPOSIT_REQUIRED:{}", cost.as_yoctonear()));
    let refund = attached.saturating_sub(cost);
    if refund.as_yoctonear() > 1 {
        Promise::new(payer.clone()).transfer(refund).detach();
    }
}
