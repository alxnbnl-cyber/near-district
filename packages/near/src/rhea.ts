/**
 * Read-only RHEA (Burrow) lending adapter. Mirrors the on-chain math the vault contract
 * uses so the UI can show the SAME numbers the contract will act on.
 * Verified against contract.main.burrow.near on 2026-11-07.
 */
import { mulDivFloor, parseIntegerString, type AllowedToken } from "@yielvy/core";
import type { NearRpc } from "./rpc";

export interface RheaAsset {
  tokenId: string;
  suppliedShares: bigint;
  suppliedBalance: bigint; // internal units
  borrowedBalance: bigint; // internal units
  extraDecimals: number;
  canDeposit: boolean;
  canWithdraw: boolean;
  supplyApr: string; // decimal string as reported, e.g. "0.0896"
  suppliedLimit: bigint | null;
}

interface RawAsset {
  supplied: { shares: string; balance: string };
  borrowed: { shares: string; balance: string };
  supply_apr: string;
  config: { extra_decimals: number; can_deposit: boolean; can_withdraw: boolean; supplied_limit?: string | null };
}

export class RheaClient {
  constructor(private readonly rpc: NearRpc, readonly contractId: string) {}

  async getAsset(token: AllowedToken): Promise<RheaAsset> {
    const raw = await this.rpc.view<RawAsset | null>(this.contractId, "get_asset", { token_id: token.contractId });
    if (!raw) throw new Error(`RHEA does not list ${token.contractId}`);
    const asset: RheaAsset = {
      tokenId: token.contractId,
      suppliedShares: parseIntegerString(raw.supplied.shares, "supplied.shares"),
      suppliedBalance: parseIntegerString(raw.supplied.balance, "supplied.balance"),
      borrowedBalance: parseIntegerString(raw.borrowed.balance, "borrowed.balance"),
      extraDecimals: raw.config.extra_decimals,
      canDeposit: raw.config.can_deposit,
      canWithdraw: raw.config.can_withdraw,
      supplyApr: raw.supply_apr,
      suppliedLimit: raw.config.supplied_limit ? BigInt(raw.config.supplied_limit) : null,
    };
    if (asset.extraDecimals !== token.rheaExtraDecimals) {
      throw new Error(`RHEA extra_decimals for ${token.symbol} is ${asset.extraDecimals}, allowlist expects ${token.rheaExtraDecimals}`);
    }
    return asset;
  }

  /** Supplied shares held by `accountId` for the token (0 if unregistered). */
  async getSuppliedShares(accountId: string, tokenId: string): Promise<bigint> {
    const acc = await this.rpc.view<{ supplied: { token_id: string; shares: string }[] } | null>(this.contractId, "get_account", {
      account_id: accountId,
    });
    const s = acc?.supplied.find((x) => x.token_id === tokenId);
    return s ? BigInt(s.shares) : 0n;
  }

  async storageBalance(accountId: string): Promise<bigint | null> {
    const r = await this.rpc.view<{ total: string } | null>(this.contractId, "storage_balance_of", { account_id: accountId });
    return r ? BigInt(r.total) : null;
  }
}

/** Token-unit value of `shares`, rounded down (identical to the vault contract, minus its 1-unit margin). */
export function sharesToTokens(shares: bigint, asset: RheaAsset): bigint {
  if (asset.suppliedShares === 0n) return 0n;
  const internal = mulDivFloor(shares, asset.suppliedBalance, asset.suppliedShares);
  return internal / 10n ** BigInt(asset.extraDecimals);
}

/** Liquidity currently withdrawable from the market, in token units (supplied - borrowed). */
export function withdrawableLiquidity(asset: RheaAsset): bigint {
  const d = asset.suppliedBalance - asset.borrowedBalance;
  return d > 0n ? d / 10n ** BigInt(asset.extraDecimals) : 0n;
}

export function utilizationBps(asset: RheaAsset): number {
  if (asset.suppliedBalance === 0n) return 0;
  return Number((asset.borrowedBalance * 10_000n) / asset.suppliedBalance);
}

/**
 * The harvestable amount the vault's `harvest_yield` would request right now.
 * value - 1 unit margin - principal * (1 + buffer)
 */
export function harvestableYield(shares: bigint, principalSupplied: bigint, safetyBufferBps: number, asset: RheaAsset): bigint {
  const value = sharesToTokens(shares, asset);
  const v = value > 0n ? value - 1n : 0n;
  const protectedAmt = principalSupplied + (principalSupplied * BigInt(safetyBufferBps)) / 10_000n;
  return v > protectedAmt ? v - protectedAmt : 0n;
}
