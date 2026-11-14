> **Archived.** Read-only checks of external contracts made during early development. It describes earlier designs (some no longer in the product) and is kept for history only. Current docs: [README](../../README.md), [PRODUCT](../PRODUCT.md), [ECONOMICS](../ECONOMICS.md), [architecture](../architecture/overview.md).

# External facts — verified, not assumed

Re-run any time: `pnpm verify:live` (read-only; signs nothing, moves nothing).

Last verified **2026-11-07** against NEAR mainnet (`rpc.mainnet.fastnear.com`) and the live 1Click API:

| Fact | Value | How verified |
|---|---|---|
| USDC (native, Circle) on NEAR | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals | `ft_metadata` |
| USDC storage deposit | 0.00125 NEAR (`1250000000000000000000` yocto) | `storage_balance_bounds` |
| RHEA lending contract | `contract.main.burrow.near`, owner `burrow.sputnik-dao.near`, `contract_mode: Running` | `get_config` |
| RHEA USDC `extra_decimals` | 12 (internal units = 18 decimals) | `get_asset` |
| RHEA USDC flags | `can_deposit: true`, `can_withdraw: true` | `get_asset` |
| RHEA storage minimum | 0.1 NEAR | `storage_balance_bounds` |
| Supply method | `USDC.ft_transfer_call(receiver_id=contract.main.burrow.near, amount, msg="")` + 1 yocto | rhea-finance/burrow-sdk-python `contract_handler.deposit` |
| Withdraw method | `contract.main.burrow.near.execute({actions:[{Withdraw:{token_id, max_amount}}]})` + 1 yocto, `max_amount` in internal units | burrow-sdk-python `withdraw` (`amount * 10^extra_decimals`) |
| Account view | `get_account(account_id) → {supplied:[{token_id, balance, shares}], collateral, …}` or `null` | lending-sdk-golang `models.go` |
| Observed market (snapshot) | supply APR ≈ 8.97 %, utilization ≈ 85.5 % | `get_asset` |
| 1Click token list | 216 assets incl. USDC on eth, arb, base, sol, gnosis, pol, bsc, aptos, op, avax, sui, stellar, monad, xlayer | `GET /v0/tokens` |
| 1Click route | Base USDC → NEAR USDC dry quote: 5.000000 → 4.999001 (min 4.974005), ~35 s, signed | `POST /v0/quote` (dry) |

## Not yet verified (blockers before real money)

- **1Click quote-signature verification**: quotes include an `ed25519:` signature; the public key and signing payload must be confirmed from official docs before we rely on it. Until then the signature is stored with the order but not treated as proof — settlement is proven by the organizer's on-chain balance and the subsequent vault deposit event.
- **RHEA testnet deployment** address and USDC test token — set via `NEXT_PUBLIC_TESTNET_*` only after `pnpm verify:live --network testnet` passes.
- **Withdraw behaviour under full utilization** on a real deployment (the vault aborts before calling RHEA when `supplied - borrowed` is insufficient; RHEA's own panic path is untested live).
