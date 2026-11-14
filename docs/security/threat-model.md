# Threat model and controls

Scope: the web app, worker and `contracts/prize-vault` as deployed on NEAR Testnet. Controls reduce risk; they do not make the system bot-proof.

| Threat | Control | Where |
|---|---|---|
| Answer leakage | Answers stored as HMAC digests (text/choice) inside AES-256-GCM ciphertext; numeric targets encrypted; never sent to clients | `server/campaigns.ts`, `core/answers.ts` |
| Brute-force answers | Per-user, per-question and per-IP rate limits; max attempts; optional cooldown; row-locked progress | `server/play.ts` |
| Skipping questions / editing client state | Server-authoritative progress; answer must target the current question | `server/play.ts` |
| Bots & scripted completion | Implausibly fast completions are **held** for manual review; attempt digests enable shared-answer analysis | `server/play.ts`, admin portal |
| Sybil / multi-account | Payout requires a verified NEAR wallet (one wallet ↔ one profile); rules state one entry per person; manual review & revocation. **Sybil attacks are reduced, not eliminated.** | auth, admin |
| Organizer self-dealing | Organizer team members cannot join their own campaigns; eligibility snapshot frozen + committed on-chain; winners can't change after finalize | `assertNotOrganizer`, contract |
| CSRF | SameSite=Lax cookies + strict Origin/Referer + `Sec-Fetch-Site` checks on every mutation | `server/http.ts` |
| XSS | No user HTML is ever rendered (plain text only, `<>` rejected); nonce-based CSP with `strict-dynamic`; uploads served with `sandbox` CSP + `nosniff` | `proxy.ts`, schemas |
| Malicious uploads | Magic-byte type detection (PNG/JPEG/WebP only, no SVG), size + dimension caps, random keys, outside web root | `server/uploads.ts` |
| Malicious links | http(s) only, no credentials, `rel="noopener noreferrer nofollow ugc"`, reporting | schemas, UI |
| Session theft | httpOnly, Secure (prod), hashed tokens in DB, revocation, "sign out everywhere"; finance actions need a wallet signature ≤12 h old | `server/session.ts`, `authz.ts` |
| Fake wallet ownership | NEP-413 signature over a single-use 32-byte nonce + RPC check that the key is a **full-access** key of the account | `near/nep413.ts` |
| Forged tx success | Every client-reported tx hash is re-fetched (`wait_until: FINAL`); signer, receiver, success and the vault's own events must match | `server/funding.ts`, `server/hints.ts` |
| Float money bugs | bigint everywhere; numeric(78,0) in Postgres; `parseUnits` rejects excess precision | `core/money.ts` |
| Admin balance edits | No endpoint edits balances; ledger is append-only (trigger); corrections need proposer ≠ approver | migrations, schema |
| Spreadsheet injection | CSV export neutralizes `= + - @` prefixes | `server/contest.ts` |
| Duplicate workers | `FOR UPDATE SKIP LOCKED`, globally unique idempotency keys, chain-state checks before every operator tx | `apps/worker` |
| Contract: unauthorized withdrawal | Prize tokens leave only to posted winners (one equal share each) or back to the sponsor | `contracts/prize-vault` |
| Contract: double payout | Winners posted once per mission with duplicates rejected; each winner index is paid once and marked paid in the callback | `lib.rs` (`finalize`, `on_share_sent`) |
| Contract: early or partial settlement | `finalize` only after the on-chain deadline; share fixed as `floor(prize / winners)` | `lib.rs` |
| Contract: wrong token or sender | `ft_on_transfer` accepts only the configured token, from the mission's sponsor, before the deadline; otherwise panics so the token refunds | `lib.rs` |
| Contract: callback forgery | `#[private]` payout and refund callbacks | `lib.rs` |
| Contract: operator key compromise | The operator can only post a winner list once per mission after the deadline; it can't change share size or send funds elsewhere. The owner rotates it with `set_operator`. Residual risk: a compromised operator could post a wrong winner list for a mission past its deadline | `lib.rs` |
| Contract: operator never settles | Sponsor reclaims the full prize with `refund_unsettled` 14 days after the deadline | `lib.rs` |
| Contract: code change | No upgrade method; redeploying requires the vault account's key | deployment |

## Before public mainnet funds

- [ ] Independent smart-contract audit of `contracts/prize-vault` (focus: ft_on_transfer checks, share maths, payout and refund callbacks)
- [ ] Owner = multisig (e.g. a Sputnik DAO or multisig contract); operator = a separate account whose key lives only in the secret manager
- [ ] Consider an on-chain dispute window before payouts for high-value missions
- [ ] Dependency + secret scanning in CI (`pnpm audit`, `cargo audit`, gitleaks)
- [ ] Bug bounty scope published
