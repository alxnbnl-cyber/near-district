/**
 * READ-ONLY live verification against real NEAR + 1Click. Moves no funds, signs nothing.
 *   pnpm verify:live                 (mainnet)
 *   pnpm verify:live --network testnet
 * Exits non-zero if any allowlisted fact no longer matches the chain.
 */
import { getNetwork, primaryToken, formatDisplay } from "@yielvy/core";
import { NearRpc } from "./rpc";
import { RheaClient, utilizationBps, withdrawableLiquidity } from "./rhea";
import { OneClickClient, supportedOrigins } from "./intents";

const networkId = process.argv.includes("--network") ? process.argv[process.argv.indexOf("--network") + 1] : "mainnet";
const net = getNetwork(networkId);
const token = primaryToken(net);
const rpc = new NearRpc({
  urls: (process.env.NEAR_RPC_URLS ?? (networkId === "mainnet" ? "https://rpc.mainnet.fastnear.com,https://free.rpc.fastnear.com" : "https://rpc.testnet.fastnear.com")).split(","),
});
const failures: string[] = [];
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(label);
};

const meta = await rpc.view<{ symbol: string; decimals: number }>(token.contractId, "ft_metadata");
check(meta.symbol === token.symbol && meta.decimals === token.decimals, "token metadata matches allowlist", `${meta.symbol}/${meta.decimals}`);

const cfg = await rpc.view<{ contract_mode?: string; owner_id: string }>(net.rheaLendingContract, "get_config");
if (cfg.contract_mode === undefined) {
  // Older Burrow builds (the testnet deployment) have no pause switch; deposit/withdraw flags below decide.
  console.log(`INFO  RHEA lending contract has no contract_mode (older build), owner ${cfg.owner_id}`);
} else {
  check(cfg.contract_mode === "Running", "RHEA lending contract is running", `owner ${cfg.owner_id}`);
}

const rhea = new RheaClient(rpc, net.rheaLendingContract);
const asset = await rhea.getAsset(token);
check(asset.extraDecimals === token.rheaExtraDecimals, "RHEA extra_decimals matches allowlist", String(asset.extraDecimals));
check(asset.canDeposit && asset.canWithdraw, "RHEA allows deposit and withdraw for token");
console.log(`INFO  supply APR ${asset.supplyApr}, utilization ${(utilizationBps(asset) / 100).toFixed(2)}%, withdrawable ${formatDisplay(withdrawableLiquidity(asset), token.decimals)} ${token.symbol}`);

const bounds = await rpc.view<{ min: string }>(net.rheaLendingContract, "storage_balance_bounds");
console.log(`INFO  RHEA storage min ${bounds.min} yocto`);
const ftBounds = await rpc.view<{ min: string }>(token.contractId, "storage_balance_bounds");
check(BigInt(ftBounds.min) === token.storageDepositYocto, "token storage deposit matches allowlist", ftBounds.min);

if (networkId === "mainnet") {
  const oc = new OneClickClient({ jwt: process.env.ONE_CLICK_JWT });
  const tokens = await oc.tokens();
  check(tokens.some((t) => t.assetId === token.intentsAssetId), "1Click lists the NEAR destination asset");
  const origins = supportedOrigins(tokens, token.intentsAssetId);
  console.log(`INFO  1Click USDC origin chains: ${origins.map((o) => o.blockchain).join(", ")}`);
  const base = origins.find((o) => o.blockchain === "base");
  if (base) {
    const q = await oc.quote({
      dry: true,
      originAsset: base.assetId,
      destinationAsset: token.intentsAssetId,
      amount: 5_000_000n,
      refundTo: "0x1111111111111111111111111111111111111111",
      recipient: net.rheaLendingContract, // any valid NEAR account; dry quote moves nothing
      slippageBps: 50,
      deadline: new Date(Date.now() + 30 * 60_000),
    });
    check(BigInt(q.quote.amountOut) > 0n, "1Click dry quote base USDC -> NEAR USDC", `${q.quote.amountIn} -> ${q.quote.amountOut}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall live checks passed");
