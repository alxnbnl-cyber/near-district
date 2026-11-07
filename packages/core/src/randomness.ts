/**
 * Verifiable random winner selection.
 *
 * Protocol (see docs/architecture/randomness.md):
 *  1. The eligibility snapshot is frozen and its commitment is written on-chain
 *     (vault.commit_period) at block H.
 *  2. In a strictly later block, vault.draw() records env::random_seed() for the period.
 *     Nobody (including Yielvy) knows that seed when the snapshot is committed.
 *  3. Anyone can recompute winners = select(seed, sortedSnapshot, count) with this function
 *     and compare them to the allocation root.
 *
 * Uses SHA-256 counter mode + rejection sampling (no modulo bias), partial Fisher–Yates.
 * Math.random() is never used for anything financial.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

class SeededStream {
  private counter = 0;
  private buf = new Uint8Array(0);
  private off = 0;
  constructor(private readonly seed: Uint8Array) {}

  private refill() {
    const c = new Uint8Array(8);
    new DataView(c.buffer).setBigUint64(0, BigInt(this.counter++));
    const input = new Uint8Array(this.seed.length + utf8ToBytes("yielvy-draw-v1").length + 8);
    input.set(this.seed, 0);
    input.set(utf8ToBytes("yielvy-draw-v1"), this.seed.length);
    input.set(c, input.length - 8);
    this.buf = sha256(input);
    this.off = 0;
  }

  nextU32(): number {
    if (this.off + 4 > this.buf.length) this.refill();
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.off, 4).getUint32(0);
    this.off += 4;
    return v;
  }

  /** Uniform integer in [0, n). */
  below(n: number): number {
    if (n <= 0 || n > 0xffffffff) throw new Error("range out of bounds");
    const limit = 0x100000000 - (0x100000000 % n);
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return x % n;
    }
  }
}

export function selectRandomWinners(seedHex: string, participantIds: string[], count: number): string[] {
  const seed = hexToBytes(seedHex);
  if (seed.length < 32) throw new Error("Seed must be at least 32 bytes");
  const pool = [...new Set(participantIds)].sort();
  if (pool.length !== participantIds.length) throw new Error("Duplicate participants");
  const k = Math.min(count, pool.length);
  const rng = new SeededStream(seed);
  for (let i = 0; i < k; i++) {
    const j = i + rng.below(pool.length - i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, k);
}
