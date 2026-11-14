# Incident response

The prize vault has no pause switch: its guarantees (funds go only to posted winners or back to the sponsor, nothing before the deadline) hold without operator action. Incidents are handled by stopping the worker, rotating keys and using the sponsor refund paths.

## Severity
- **SEV1**: funds at risk (reconciliation shortfall, unexpected outflow, operator key compromise)
- **SEV2**: payouts or funding blocked (worker down, RPC or indexer outage, dead payout jobs)
- **SEV3**: degraded experience (map, hints or uploads failing)

## SEV1 playbook
1. **Stop the worker** so no new `finalize` or `payout` calls are sent.
2. **Operator key suspected?** The owner calls `set_operator` with a fresh account, then deletes the old key:
   ```bash
   near contract call-function as-transaction $VAULT set_operator json-args '{"operator_id":"<new-operator>"}' prepaid-gas '10 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
   ```
   Update `OPERATOR_ACCOUNT_ID` and `OPERATOR_PRIVATE_KEY` on the worker before restarting it.
3. **Snapshot evidence:** `get_config`, `get_mission` and `get_winners` for affected missions, the token balance of the vault, the latest `vault.reconcile` result, and an audit log export.
4. **Unsettled missions** stay safe in the vault. If settlement can't resume, each sponsor can reclaim its prize with `refund_unsettled` 14 days after the deadline.
5. Communicate status honestly on the site and to affected projects within 24 h.
6. Restart the worker only after the cause is fixed and reconciliation is `ok`.

## Failed payouts
A failed transfer is recorded as `reward_failed`. The worker registers the winner with the token if needed and calls `retry_payouts`. Anyone can call `payout` or `retry_payouts`; funds still go only to the posted winners.

## Worker, RPC or indexer outage
Jobs are durable; nothing is lost. Restart the worker; add a fallback RPC in `NEAR_RPC_URLS`. Hint verifications waiting on the indexer or RPC are re-checked by `hints.reconcile`. Dead jobs appear in the admin portal; requeue them after fixing the cause.
