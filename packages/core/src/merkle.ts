/**
 * Reward allocation Merkle tree. MUST stay byte-for-byte identical to
 * contracts/vault/src/merkle.rs.
 *   leaf = sha256(0x00 || "campaign_id\x1fperiod_id\x1faccount_id\x1famount_decimal")
 *   node = sha256(0x01 || min(a,b) || max(a,b))   sorted pairs, so proofs carry no direction bits
 * An odd node at the end of a level is promoted unchanged.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export interface AllocationLeaf {
  campaignId: string;
  periodId: string;
  accountId: string;
  amount: bigint;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function cmp(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

export function leafHash(l: AllocationLeaf): Uint8Array {
  if (l.amount <= 0n) throw new Error("Allocation amount must be positive");
  const body = `${l.campaignId}\u001f${l.periodId}\u001f${l.accountId}\u001f${l.amount.toString()}`;
  return sha256(concat(new Uint8Array([0]), utf8ToBytes(body)));
}

export function nodeHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [x, y] = cmp(a, b) <= 0 ? [a, b] : [b, a];
  return sha256(concat(new Uint8Array([1]), x, y));
}

export interface MerkleTree {
  root: string;
  /** accountId -> hex sibling hashes, leaf to root */
  proofs: Map<string, string[]>;
}

export function buildMerkleTree(leaves: AllocationLeaf[]): MerkleTree {
  if (leaves.length === 0) throw new Error("Cannot build a tree with no allocations");
  const seen = new Set<string>();
  for (const l of leaves) {
    if (seen.has(l.accountId)) throw new Error(`Duplicate allocation for ${l.accountId}`);
    seen.add(l.accountId);
  }
  const sorted = [...leaves].sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
  let level = sorted.map(leafHash);
  const proofs = sorted.map(() => [] as string[]);
  let positions = sorted.map((_, i) => i);
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const right = level[i + 1];
      next.push(right ? nodeHash(level[i]!, right) : level[i]!);
    }
    positions.forEach((pos, leafIdx) => {
      const sib = pos ^ 1;
      if (sib < level.length) proofs[leafIdx]!.push(bytesToHex(level[sib]!));
    });
    positions = positions.map((p) => p >> 1);
    level = next;
  }
  const map = new Map<string, string[]>();
  sorted.forEach((l, i) => map.set(l.accountId, proofs[i]!));
  return { root: bytesToHex(level[0]!), proofs: map };
}

export function verifyProof(leaf: AllocationLeaf, proof: string[], rootHex: string): boolean {
  let h = leafHash(leaf);
  for (const p of proof) h = nodeHash(h, hexToBytes(p));
  return bytesToHex(h) === rootHex;
}

/**
 * Commitment to a frozen eligibility snapshot: sha256 over sorted, newline-joined
 * participant ids. Published on-chain before any randomness is known.
 */
export function eligibilityCommitment(campaignId: string, periodId: string, participantIds: string[]): string {
  const sorted = [...new Set(participantIds)].sort();
  if (sorted.length !== participantIds.length) throw new Error("Duplicate participants in snapshot");
  return bytesToHex(sha256(utf8ToBytes(`near-district-eligibility-v1\n${campaignId}\n${periodId}\n${sorted.join("\n")}`)));
}
