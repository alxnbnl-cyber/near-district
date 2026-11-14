# Threat model & controls

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
| Forged tx success | Every client-reported tx hash is re-fetched (`wait_until: FINAL`); signer, receiver, success and the vault's own events must match | `server/claims.ts`, `server/funding.ts` |
| Float money bugs | bigint everywhere; numeric(78,0) in Postgres; `parseUnits` rejects excess precision | `core/money.ts` |
| Admin balance edits | No endpoint edits balances; ledger is append-only (trigger); corrections need proposer ≠ approver | migrations, schema |
| Spreadsheet injection | CSV export neutralizes `= + - @` prefixes | `server/contest.ts` |
| Duplicate workers | `FOR UPDATE SKIP LOCKED`, globally unique idempotency keys, chain-state checks before every operator tx | `apps/worker` |
| Contract: unauthorized withdrawal | Prize tokens leave only to posted winners (one equal share each) or back to the sponsor | `contracts/prize-vault` |
| Contract: double claim / replay | Claim key (campaign, period, account) + Merkle leaf bound to predecessor | `periods.rs` |
| Contract: callback forgery | `#[private]` callbacks; op-id matching | `lending.rs` |
| Contract: rogue upgrade | Owner-only proposal, ≥72 h timelock, guardian can cancel, hash-pinned code | `upgrade.rs` |
| Contract: operator key compromise | Can't transfer funds; reservations capped per period by sponsor; results vetoable for 24 h; guardian pause | contract |

## Before public mainnet funds

- [ ] Independent smart-contract audit of `contracts/prize-vault` (focus: ft_on_transfer checks, share maths, payout and refund callbacks)
- [ ] Testnet run of the full lifecycle against a real RHEA deployment
- [ ] Owner = multisig (e.g. Sputnik DAO / multisig contract), guardian = separate key, operator = function-call key
- [ ] Dependency + secret scanning in CI (`pnpm audit`, `cargo audit`, gitleaks)
- [ ] Bug bounty scope published
