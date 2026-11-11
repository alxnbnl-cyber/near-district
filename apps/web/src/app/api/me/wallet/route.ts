import { route } from "@/server/http";
import { network, token } from "@/server/near";
import { env } from "@/server/env";
import { fmt, offrampMode, walletBalance } from "@/server/offramp";

/** The player's payout wallet and its prize-token balance, plus how cash-out works on this deployment. */
export const GET = route(
  async (_req, { user }) => {
    const t = token();
    const account = user!.payoutAccountId;
    let balance: bigint | null = null;
    if (account) {
      try {
        balance = await walletBalance(account);
      } catch {
        balance = null; // RPC hiccup: show "—" rather than a wrong number
      }
    }
    return {
      account,
      network: network().networkId,
      symbol: t.symbol,
      decimals: t.decimals,
      tokenId: t.contractId,
      balance: balance === null ? null : fmt(balance),
      balanceRaw: balance === null ? null : balance.toString(),
      mode: offrampMode(),
      offrampAccount: offrampMode() === "testnet" ? env().OFFRAMP_ACCOUNT_ID : null,
      explorer: account ? network().explorerAccountUrl(account) : null,
    };
  },
  { auth: "required" },
);
