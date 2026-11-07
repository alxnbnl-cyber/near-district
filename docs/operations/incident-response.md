# Incident response

## Severity
- **SEV1** — funds at risk (reconciliation shortfall, unexpected outflow, flagged RHEA op, RHEA paused/exploited, key compromise)
- **SEV2** — payouts or funding blocked (worker dead, RPC outage, 1Click outage)
- **SEV3** — degraded UX

## SEV1 playbook
1. **Pause** with the guardian key (no app involvement):
   ```bash
   near contract call-function as-transaction $VAULT pause json-args '{"all":true}' prepaid-gas '10 Tgas' attached-deposit '0 NEAR' sign-as $GUARDIAN network-config mainnet sign-with-keychain send
   ```
   `all:false` keeps claims and sponsor withdrawals open (preferred if only inflows/operator are suspect).
2. Veto any finalized-but-not-yet-claimable period that looks wrong: `veto_period`.
3. Operator key suspected? Owner multisig calls `set_operator` to a fresh account; delete the old function-call key.
4. Snapshot evidence: `get_totals`, `check_invariants`, RHEA `get_account`, latest reconciliation run, audit log export.
5. Communicate status honestly on the site banner and to affected organizers within 24 h.
6. Unpause only via the owner multisig after root cause is fixed and reconciliation is `ok`.

## Flagged RHEA operation (`op_flagged`)
The vault keeps the lock and pauses inflows. Investigate RHEA state and the tx. If nothing should be credited, guardian calls `clear_flagged_op` (it can never credit funds). If funds should have been credited, that requires a reviewed contract upgrade — never a manual balance edit.

## Worker / RPC outage
Jobs are durable; nothing is lost. Restart the worker; add a fallback RPC in `NEAR_RPC_URLS`. Dead jobs appear in the admin portal; requeue after fixing the cause.
