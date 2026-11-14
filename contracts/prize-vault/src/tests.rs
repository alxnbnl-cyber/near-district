use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseError};

const DAY: u64 = 24 * 3600 * 1_000_000_000;
fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn ctx(pred: &str, ts: u64, deposit: NearToken) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("vault.testnet"))
        .predecessor_account_id(acc(pred))
        .block_timestamp(ts)
        .attached_deposit(deposit)
        .build());
}
fn vault() -> PrizeVault {
    ctx("owner.testnet", 1_000, NearToken::from_yoctonear(0));
    PrizeVault::new(acc("owner.testnet"), acc("operator.testnet"), acc("usdc.testnet"))
}
/// a vault with mission 1 (deadline day 10) funded with `prize` by sponsor.testnet
fn funded(prize: u128) -> PrizeVault {
    let mut v = vault();
    ctx("sponsor.testnet", DAY, MISSION_STORAGE);
    assert_eq!(v.create_mission(U64(10 * DAY)).0, 1);
    ctx("usdc.testnet", 2 * DAY, NearToken::from_yoctonear(0));
    let _ = v.ft_on_transfer(acc("sponsor.testnet"), U128(prize), r#"{"mission_id":"1"}"#.into());
    v
}
fn winners(n: usize) -> Vec<AccountId> {
    (0..n).map(|i| acc(&format!("player{i}.testnet"))).collect()
}

#[test]
fn funding_credits_prize_and_emits_event() {
    let v = funded(300_000_000);
    let m = v.get_mission(U64(1)).unwrap();
    assert_eq!(m.prize.0, 300_000_000);
    assert_eq!(m.status, MissionStatus::Open);
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"prize_funded\"") && l.contains(EVENT_STANDARD)));
}

#[test]
#[should_panic(expected = "Only the prize token is accepted")]
fn rejects_other_tokens() {
    let mut v = funded(1);
    ctx("fake-usdc.testnet", 2 * DAY, NearToken::from_yoctonear(0));
    let _ = v.ft_on_transfer(acc("sponsor.testnet"), U128(5), r#"{"mission_id":"1"}"#.into());
}

#[test]
#[should_panic(expected = "Only the mission's sponsor can fund it")]
fn rejects_funding_from_non_sponsor() {
    let mut v = funded(1);
    ctx("usdc.testnet", 2 * DAY, NearToken::from_yoctonear(0));
    let _ = v.ft_on_transfer(acc("someone.testnet"), U128(5), r#"{"mission_id":"1"}"#.into());
}

#[test]
#[should_panic(expected = "Mission deadline has passed")]
fn rejects_funding_after_deadline() {
    let mut v = funded(1);
    ctx("usdc.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    let _ = v.ft_on_transfer(acc("sponsor.testnet"), U128(5), r#"{"mission_id":"1"}"#.into());
}

#[test]
#[should_panic(expected = "Mission deadline has not passed")]
fn cannot_finalize_before_deadline() {
    let mut v = funded(300);
    ctx("operator.testnet", 5 * DAY, WINNER_STORAGE.saturating_mul(2));
    v.finalize(U64(1), winners(2));
}

#[test]
#[should_panic(expected = "Only the operator")]
fn only_operator_finalizes() {
    let mut v = funded(300);
    ctx("sponsor.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(2));
    v.finalize(U64(1), winners(2));
}

#[test]
#[should_panic(expected = "Duplicate winner")]
fn rejects_duplicate_winners() {
    let mut v = funded(300);
    ctx("operator.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(2));
    v.finalize(U64(1), vec![acc("a.testnet"), acc("a.testnet")]);
}

#[test]
fn equal_shares_and_remainder_to_sponsor() {
    let mut v = funded(300_000_001);
    ctx("operator.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(6));
    assert_eq!(v.finalize(U64(1), winners(6)).0, 50_000_000);
    let m = v.get_mission(U64(1)).unwrap();
    assert_eq!(m.status, MissionStatus::Paying);
    assert_eq!(m.share.0, 50_000_000);
    assert_eq!(m.refund_owed.0, 1);
    assert_eq!(v.get_winners(U64(1), 0, 10).len(), 6);
}

#[test]
#[should_panic(expected = "Mission already finalized")]
fn finalize_only_once() {
    let mut v = funded(300);
    ctx("operator.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(3));
    v.finalize(U64(1), winners(3));
    v.finalize(U64(1), winners(3));
}

#[test]
fn payout_batches_and_completion() {
    let mut v = funded(1_200);
    ctx("operator.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(12));
    v.finalize(U64(1), winners(12));
    ctx("anyone.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    assert_eq!(v.payout(U64(1)), 10);
    assert_eq!(v.payout(U64(1)), 2);
    assert_eq!(v.payout(U64(1)), 0);
    assert!(v.get_winners(U64(1), 0, 20).iter().all(|w| w.state == PayoutState::InFlight));
    // callbacks: 11 succeed, 1 fails
    ctx("vault.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    for i in 0..12u32 {
        let r: Result<(), PromiseError> = if i == 7 { Err(PromiseError::Failed) } else { Ok(()) };
        v.on_share_sent(U64(1), i, r);
    }
    let m = v.get_mission(U64(1)).unwrap();
    assert_eq!(m.paid_count, 11);
    assert_eq!(m.paid_total.0, 1_100);
    assert_eq!(m.status, MissionStatus::Paying);
    assert_eq!(v.get_winners(U64(1), 7, 1)[0].state, PayoutState::Failed);
    // retry the failed one, then it lands
    ctx("anyone.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    assert_eq!(v.retry_payouts(U64(1), vec![7, 3]), 1);
    ctx("vault.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    v.on_share_sent(U64(1), 7, Ok(()));
    let m = v.get_mission(U64(1)).unwrap();
    assert_eq!(m.status, MissionStatus::Completed);
    assert_eq!(m.paid_total.0, 1_200);
}

#[test]
fn no_winners_refunds_whole_prize() {
    let mut v = funded(300);
    ctx("operator.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    v.finalize(U64(1), vec![]);
    let m = v.get_mission(U64(1)).unwrap();
    assert_eq!(m.status, MissionStatus::Refunded);
    assert_eq!(m.refund_owed.0, 300);
    ctx("anyone.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    let _ = v.withdraw_refund(U64(1));
    assert_eq!(v.get_mission(U64(1)).unwrap().refund_owed.0, 0);
    // a failed refund transfer is put back
    ctx("vault.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    v.on_refund_sent(U64(1), U128(300), Err(PromiseError::Failed));
    assert_eq!(v.get_mission(U64(1)).unwrap().refund_owed.0, 300);
}

#[test]
#[should_panic(expected = "Refund opens 14 days after the deadline")]
fn sponsor_refund_waits_for_grace() {
    let mut v = funded(300);
    ctx("sponsor.testnet", 12 * DAY, NearToken::from_yoctonear(0));
    let _ = v.refund_unsettled(U64(1));
}

#[test]
fn sponsor_refund_after_grace_when_unsettled() {
    let mut v = funded(300);
    ctx("sponsor.testnet", 10 * DAY + REFUND_GRACE_NS, NearToken::from_yoctonear(0));
    let _ = v.refund_unsettled(U64(1));
    assert_eq!(v.get_mission(U64(1)).unwrap().status, MissionStatus::Refunded);
}

#[test]
#[should_panic(expected = "Mission was already settled")]
fn sponsor_cannot_refund_after_finalize() {
    let mut v = funded(300);
    ctx("operator.testnet", 11 * DAY, WINNER_STORAGE.saturating_mul(1));
    v.finalize(U64(1), winners(1));
    ctx("sponsor.testnet", 10 * DAY + REFUND_GRACE_NS, NearToken::from_yoctonear(0));
    let _ = v.refund_unsettled(U64(1));
}

#[test]
#[should_panic(expected = "Nothing to refund")]
fn cannot_withdraw_refund_twice() {
    let mut v = funded(300);
    ctx("operator.testnet", 11 * DAY, NearToken::from_yoctonear(0));
    v.finalize(U64(1), vec![]);
    let _ = v.withdraw_refund(U64(1));
    let _ = v.withdraw_refund(U64(1));
}
