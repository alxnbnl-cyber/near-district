/**
 * Exact integer money arithmetic. Every amount in NEAR District is a bigint of the
 * token's smallest unit. Floating point is never used for money.
 */

export type Amount = bigint;

export class MoneyError extends Error {}

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/** Parse a human decimal string ("12.5") into smallest units. Rejects excess precision. */
export function parseUnits(value: string, decimals: number): Amount {
  const trimmed = value.trim();
  const m = DECIMAL_RE.exec(trimmed);
  if (!m) throw new MoneyError(`Invalid amount "${value}"`);
  const whole = m[1]!;
  const frac = m[2] ?? "";
  if (frac.length > decimals) {
    throw new MoneyError(`Amount "${value}" has more than ${decimals} decimal places`);
  }
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** Format smallest units as a decimal string, trimming trailing zeros (keeps `minFraction`). */
export function formatUnits(amount: Amount, decimals: number, minFraction = 0): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  let frac = decimals > 0 ? s.slice(s.length - decimals) : "";
  frac = frac.replace(/0+$/, "");
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, "0");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** Display helper: rounds DOWN to `places` so we never overstate a balance. */
export function formatDisplay(amount: Amount, decimals: number, places = 2): string {
  if (places >= decimals) return formatUnits(amount, decimals, places);
  const unit = 10n ** BigInt(decimals - places);
  const truncated = (amount / unit) * unit;
  const [whole, frac = ""] = formatUnits(truncated, decimals, places).split(".");
  const withSep = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return places > 0 ? `${withSep}.${frac.padEnd(places, "0").slice(0, places)}` : withSep;
}

export function mulDivFloor(a: Amount, b: Amount, d: Amount): Amount {
  if (d === 0n) throw new MoneyError("Division by zero");
  if (a < 0n || b < 0n || d < 0n) throw new MoneyError("Negative operand");
  return (a * b) / d;
}

export function mulDivCeil(a: Amount, b: Amount, d: Amount): Amount {
  if (d === 0n) throw new MoneyError("Division by zero");
  if (a < 0n || b < 0n || d < 0n) throw new MoneyError("Negative operand");
  const p = a * b;
  return p === 0n ? 0n : (p - 1n) / d + 1n;
}

export const BPS_DENOMINATOR = 10_000n;

/** Fraction of `amount` in basis points, rounded down. */
export function bpsOf(amount: Amount, bps: number | bigint): Amount {
  const b = BigInt(bps);
  if (b < 0n || b > BPS_DENOMINATOR) throw new MoneyError(`Invalid bps ${bps}`);
  return mulDivFloor(amount, b, BPS_DENOMINATOR);
}

export function minAmount(...xs: Amount[]): Amount {
  return xs.reduce((m, x) => (x < m ? x : m));
}
export function maxAmount(...xs: Amount[]): Amount {
  return xs.reduce((m, x) => (x > m ? x : m));
}
export function sum(xs: Iterable<Amount>): Amount {
  let t = 0n;
  for (const x of xs) t += x;
  return t;
}

/** Parse a non-negative integer string coming from chain/RPC JSON. */
export function parseIntegerString(v: unknown, label = "value"): Amount {
  if (typeof v !== "string" || !/^\d+$/.test(v)) throw new MoneyError(`Invalid integer ${label}: ${String(v)}`);
  return BigInt(v);
}

/** Parse an unsigned decimal string ("0.0896...") into a fixed-point bigint with `scale` decimals (floor). */
export function parseFixed(v: string, scale: number): Amount {
  const m = DECIMAL_RE.exec(v.trim());
  if (!m) throw new MoneyError(`Invalid decimal "${v}"`);
  const frac = (m[2] ?? "").slice(0, scale).padEnd(scale, "0");
  return BigInt(m[1]! + frac);
}
