# Verifiable random draws

Random-draw rewards are **disabled by default** (`RANDOM_DRAW_ALLOWED_COUNTRIES` empty) because prize draws are regulated. When enabled for a cleared jurisdiction:

1. The period ends. The worker freezes eligibility (qualified participants with a verified payout wallet) into an immutable `eligibility_snapshots` row (DB trigger forbids edits).
2. `commitment = sha256("yielvy-eligibility-v1\n{campaign}\n{period}\n" + sorted account ids)` is written on-chain with `commit_period` at block **H**.
3. In a block **> H**, `record_seed` stores `env::random_seed()` for the period. It can only be recorded once. Nobody knows that seed when the snapshot is committed.
4. Winners = `selectRandomWinners(seed, snapshot, n)` (`packages/core/src/randomness.ts`): SHA-256 counter-mode stream, rejection sampling (no modulo bias), partial Fisher–Yates over the sorted list.
5. Allocations become a Merkle root published with `finalize_period`; anyone can recompute them from the public snapshot + seed. Sponsors and the guardian can veto during the dispute window.

Residual risk: a NEAR block producer could in theory influence `random_seed` for its block. For the prize sizes Yielvy targets this is accepted and disclosed; a drand/VRF beacon can replace step 3 without changing anything else.

`Math.random()` is never used for anything financial.
