//! External interfaces. Shapes verified against the live RHEA (Burrow) mainnet contract
//! `contract.main.burrow.near` on 2026-11-07 (get_asset / get_account views) and the
//! rhea-finance/burrow-sdk-python + lending-sdk-golang SDKs.
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{ext_contract, AccountId, PromiseOrValue};

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128>;
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
}

/// RHEA lending actions used by the vault. ONLY `Withdraw` is ever sent:
/// no borrow, no collateral, no leverage.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub enum LendingAction {
    Withdraw { token_id: AccountId, max_amount: U128 },
}

#[ext_contract(ext_lending)]
pub trait Lending {
    /// Requires 1 yoctoNEAR. Amounts are in internal units (token decimals + extra_decimals).
    fn execute(&mut self, actions: Vec<LendingAction>);
    fn get_account(&self, account_id: AccountId) -> Option<LendingAccountView>;
    fn get_asset(&self, token_id: AccountId) -> Option<LendingAssetView>;
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct LendingPool {
    pub shares: U128,
    pub balance: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct LendingAssetConfig {
    pub extra_decimals: u8,
    pub can_withdraw: bool,
    pub can_deposit: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct LendingAssetView {
    pub supplied: LendingPool,
    pub borrowed: LendingPool,
    pub config: LendingAssetConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct LendingAccountAsset {
    pub token_id: AccountId,
    pub balance: U128,
    pub shares: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct LendingAccountView {
    pub supplied: Vec<LendingAccountAsset>,
    #[serde(default)]
    pub collateral: Vec<LendingAccountAsset>,
}
