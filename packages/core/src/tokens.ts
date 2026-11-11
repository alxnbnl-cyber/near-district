/**
 * Explicit token allowlist. Similarly named assets are NOT interchangeable.
 * Mainnet values verified 2026-11-07 against on-chain ft_metadata, RHEA get_asset
 * and the live 1Click /v0/tokens list. See docs/architecture/external-verification.md.
 */
export type NetworkId = "mainnet" | "testnet";

export interface AllowedToken {
  symbol: string;
  contractId: string;
  decimals: number;
  /** RHEA (Burrow) internal balances use `decimals + extraDecimals`. */
  rheaExtraDecimals: number;
  /** 1Click asset identifier for this token on NEAR. */
  intentsAssetId: string;
  /** NEP-145 storage deposit required for an account to hold this token (yoctoNEAR). */
  storageDepositYocto: bigint;
}

export interface NetworkConfig {
  networkId: NetworkId;
  rheaLendingContract: string;
  explorerTxUrl: (hash: string) => string;
  explorerAccountUrl: (account: string) => string;
  tokens: AllowedToken[];
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    networkId: "mainnet",
    rheaLendingContract: "contract.main.burrow.near",
    explorerTxUrl: (h) => `https://nearblocks.io/txns/${h}`,
    explorerAccountUrl: (a) => `https://nearblocks.io/address/${a}`,
    tokens: [
      {
        symbol: "USDC",
        contractId: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        decimals: 6,
        rheaExtraDecimals: 12,
        intentsAssetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        storageDepositYocto: 1_250_000_000_000_000_000_000n,
      },
    ],
  },
  testnet: {
    networkId: "testnet",
    // Testnet values MUST be verified with `pnpm verify:live --network testnet` before use.
    rheaLendingContract: process.env.NEXT_PUBLIC_TESTNET_RHEA_CONTRACT ?? "",
    explorerTxUrl: (h) => `https://testnet.nearblocks.io/txns/${h}`,
    explorerAccountUrl: (a) => `https://testnet.nearblocks.io/address/${a}`,
    tokens: process.env.NEXT_PUBLIC_TESTNET_USDC_CONTRACT
      ? [
          {
            // must equal the token's on-chain ft_metadata symbol (e.g. usdc.fakes.testnet is "USDC.e")
            symbol: process.env.NEXT_PUBLIC_TESTNET_USDC_SYMBOL ?? "USDC",
            contractId: process.env.NEXT_PUBLIC_TESTNET_USDC_CONTRACT,
            decimals: 6,
            rheaExtraDecimals: 12,
            intentsAssetId: "",
            storageDepositYocto: 1_250_000_000_000_000_000_000n,
          },
        ]
      : [],
  },
};

export function getNetwork(id: string | undefined): NetworkConfig {
  if (id !== "mainnet" && id !== "testnet") throw new Error(`Unknown NEAR network "${id}"`);
  return NETWORKS[id];
}

export function requireAllowedToken(network: NetworkConfig, contractId: string): AllowedToken {
  const t = network.tokens.find((x) => x.contractId === contractId);
  if (!t) throw new Error(`Token ${contractId} is not on the ${network.networkId} allowlist`);
  return t;
}

export function primaryToken(network: NetworkConfig): AllowedToken {
  const t = network.tokens[0];
  if (!t) throw new Error(`No allowlisted token configured for ${network.networkId}`);
  return t;
}
