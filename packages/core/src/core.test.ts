import { describe, expect, it } from "vitest";
import {
  allocateRewards,
  buildChoiceRule,
  buildMerkleTree,
  buildNumericRule,
  buildTextRule,
  checkAnswer,
  DISTRICTS,
  eligibilityCommitment,
  evaluateRuleChange,
  formatDisplay,
  formatUnits,
  fundingMachine,
  mulDivCeil,
  nextFreePlotIndex,
  parseUnits,
  plotPosition,
  PLOT_TILES,
  quadrantPlot,
  verifyProof,
  weightedScore,
  withdrawalMachine,
  type CampaignRules,
  type Candidate,
  type RewardConfig,
} from "./index";

describe("money", () => {
  it("parses and formats exact units", () => {
    expect(parseUnits("12.5", 6)).toBe(12_500_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(formatUnits(12_500_000n, 6)).toBe("12.5");
    expect(formatUnits(1n, 6)).toBe("0.000001");
    expect(() => parseUnits("0.0000001", 6)).toThrow();
    expect(() => parseUnits("1e5", 6)).toThrow();
    expect(() => parseUnits("-1", 6)).toThrow();
  });
  it("display rounds down and never overstates", () => {
    expect(formatDisplay(1_999_999n, 6, 2)).toBe("1.99");
    expect(formatDisplay(1_234_567_890_000n, 6, 2)).toBe("1,234,567.89");
  });
  it("handles values far beyond float precision", () => {
    const big = 2n ** 120n + 7n;
    expect(formatUnits(big, 0)).toBe(big.toString());
    expect(mulDivCeil(10n, 1n, 3n)).toBe(4n);
  });
});

describe("answers", () => {
  const pepper = "test-pepper";
  it("normalizes text answers and aliases", () => {
    const rule = buildTextRule(pepper, "s1", ["The Lighthouse", "lighthouse"]);
    expect(checkAnswer(rule, "  the   LIGHTHOUSE ", pepper, "s1")).toBe(true);
    expect(checkAnswer(rule, "LightHouse", pepper, "s1")).toBe(true);
    expect(checkAnswer(rule, "light house", pepper, "s1")).toBe(false);
    // digest is salt-bound
    expect(checkAnswer(rule, "lighthouse", pepper, "s2")).toBe(false);
    // the stored rule never contains the plain answer
    expect(JSON.stringify(rule)).not.toContain("lighthouse");
  });
  it("checks multiple choice by option id", () => {
    const rule = buildChoiceRule(pepper, "q", "opt_b");
    expect(checkAnswer(rule, "opt_b", pepper, "q")).toBe(true);
    expect(checkAnswer(rule, "opt_a", pepper, "q")).toBe(false);
  });
  it("checks numeric answers with fixed-point tolerance", () => {
    const rule = buildNumericRule("3.14159", "0.001");
    expect(checkAnswer(rule, "3.1414", pepper, "")).toBe(true);
    expect(checkAnswer(rule, "3.142", pepper, "")).toBe(true);
    expect(checkAnswer(rule, "3.143", pepper, "")).toBe(false);
    expect(checkAnswer(rule, "1,000", pepper, "")).toBe(false);
    expect(checkAnswer(buildNumericRule("1000", "0"), "1,000", pepper, "")).toBe(true);
    expect(checkAnswer(rule, "NaN", pepper, "")).toBe(false);
    // 0.1 + 0.2 style float traps do not exist in fixed point
    expect(checkAnswer(buildNumericRule("0.3", "0"), "0.30", pepper, "")).toBe(true);
  });
});

describe("merkle", () => {
  const leaves = ["alice.near", "bob.near", "carol.near", "dave.near", "erin.near"].map((a, i) => ({
    campaignId: "c1",
    periodId: "p1",
    accountId: a,
    amount: BigInt(1000 + i),
  }));
  it("produces verifiable proofs for every leaf including the odd one", () => {
    const t = buildMerkleTree(leaves);
    for (const l of leaves) expect(verifyProof(l, t.proofs.get(l.accountId)!, t.root)).toBe(true);
  });
  it("rejects tampered amount, account or period", () => {
    const t = buildMerkleTree(leaves);
    const l = leaves[0]!;
    const p = t.proofs.get(l.accountId)!;
    expect(verifyProof({ ...l, amount: l.amount + 1n }, p, t.root)).toBe(false);
    expect(verifyProof({ ...l, accountId: "mallory.near" }, p, t.root)).toBe(false);
    expect(verifyProof({ ...l, periodId: "p2" }, p, t.root)).toBe(false);
  });
  it("is order independent and rejects duplicates", () => {
    expect(buildMerkleTree([...leaves].reverse()).root).toBe(buildMerkleTree(leaves).root);
    expect(() => buildMerkleTree([leaves[0]!, leaves[0]!])).toThrow();
  });
  it("matches the Rust contract test vector", () => {
    // Same vector is asserted in contracts/vault/src/merkle.rs tests.
    const t = buildMerkleTree([
      { campaignId: "1", periodId: "1", accountId: "alice.near", amount: 500n },
      { campaignId: "1", periodId: "1", accountId: "bob.near", amount: 300n },
    ]);
    expect(t.root).toMatchInlineSnapshot(`"c2d77a0eeb8d427e44e04e59af6f46c25209e76978ddc3b8b25fa72b06f4c210"`);
  });
  it("commits to eligibility independent of order", () => {
    expect(eligibilityCommitment("c", "p", ["b", "a"])).toBe(eligibilityCommitment("c", "p", ["a", "b"]));
    expect(() => eligibilityCommitment("c", "p", ["a", "a"])).toThrow();
  });
});

describe("reward allocation", () => {
  const cands: Candidate[] = [
    { accountId: "a", score: 90n, completedAt: 3 },
    { accountId: "b", score: 95n, completedAt: 2 },
    { accountId: "c", score: 90n, completedAt: 1 },
    { accountId: "d", score: 10n, completedAt: 4 },
  ];
  const base: RewardConfig = { mode: "equal", winnersCount: 1, minPayout: 0n, tieBreak: "earliest_completion" };

  it("equal mode never over-allocates and returns dust", () => {
    const r = allocateRewards(10n, cands, base);
    expect(r.allocations.map((x) => x.amount)).toEqual([2n, 2n, 2n, 2n]);
    expect(r.allocatedTotal + r.remainder).toBe(10n);
  });
  it("respects min payout threshold honestly", () => {
    const r = allocateRewards(10n, cands, { ...base, minPayout: 3n });
    expect(r.allocations).toHaveLength(0);
    expect(r.remainder).toBe(10n);
    expect(r.blockedReason).toMatch(/minimum payout/);
  });
  it("applies per-person caps", () => {
    const r = allocateRewards(1000n, cands, { ...base, perPersonCap: 100n });
    expect(r.allocatedTotal).toBe(400n);
    expect(r.remainder).toBe(600n);
  });
  it("rejects organizer-selected winners who are not eligible", () => {
    expect(() =>
      allocateRewards(100n, cands, { ...base, mode: "organizer_selected", winnersCount: 2 }, { selectedAccountIds: ["zed"] }),
    ).toThrow(/not eligible/);
    const ok = allocateRewards(100n, cands, { ...base, mode: "organizer_selected", winnersCount: 2 }, { selectedAccountIds: ["d", "a"] });
    expect(ok.allocations).toEqual([
      { accountId: "a", amount: 50n },
      { accountId: "d", amount: 50n },
    ]);
  });
  it("limits to max qualified by completion order", () => {
    const r = allocateRewards(30n, cands, { ...base, maxQualified: 3 });
    expect(r.allocations.map((x) => x.accountId).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("state machines", () => {
  it("blocks skipping verification steps", () => {
    expect(fundingMachine.can("AWAITING_PAYMENT", "SUPPLIED")).toBe(false);
    expect(fundingMachine.can("RECEIVED", "SUPPLY_PENDING")).toBe(true);
    expect(() => fundingMachine.assert("CREATED", "SUPPLIED")).toThrow(/Illegal/);
    expect(withdrawalMachine.can("REQUESTED", "CONFIRMED")).toBe(false);
  });
});

describe("campaign rule versioning", () => {
  const rules: CampaignRules = {
    template: "treasure_hunt",
    startsAt: "2026-12-01T00:00:00Z",
    endsAt: "2026-12-10T00:00:00Z",
    eligibility: { requireVerifiedPayout: true, blockedJurisdictions: [] },
    reward: { mode: "equal", winnersCount: 1, tieBreak: "earliest_completion", minPayout: "0" },
    fundingSource: "direct",
    periods: 1,
    claimWindowDays: 30,
  };
  it("allows beneficial changes after participants joined, with notice", () => {
    const d = evaluateRuleChange(rules, { ...rules, endsAt: "2026-12-20T00:00:00Z" }, 10, false);
    expect(d).toMatchObject({ allowed: true, requiresNotice: true });
  });
  it("blocks material changes after participants joined", () => {
    const d = evaluateRuleChange(rules, { ...rules, reward: { ...rules.reward, mode: "organizer_selected" } }, 1, false);
    expect(d.allowed).toBe(false);
  });
  it("blocks every rule change after the deadline", () => {
    expect(evaluateRuleChange(rules, { ...rules, claimWindowDays: 60 }, 0, true).allowed).toBe(false);
  });
  it("computes weighted judging scores in integers", () => {
    const crit = [
      { key: "o", label: "Originality", weightBps: 4000 },
      { key: "u", label: "Usefulness", weightBps: 4000 },
      { key: "c", label: "Clarity", weightBps: 2000 },
    ];
    expect(weightedScore(crit, { o: 9, u: 8, c: 7 })).toBe(820);
    expect(() => weightedScore(crit, { o: 11, u: 8, c: 7 })).toThrow();
  });
});

describe("world layout", () => {
  it("assigns unique, non-overlapping footprints across all districts", () => {
    const tiles = new Set<string>();
    for (const d of DISTRICTS) {
      for (let n = 0; n < 200; n++) {
        const p = plotPosition(d, n);
        for (let dx = 0; dx < PLOT_TILES - 1; dx++) {
          for (let dy = 0; dy < PLOT_TILES - 1; dy++) {
            const k = `${p.tileX + dx},${p.tileY + dy}`;
            expect(tiles.has(k)).toBe(false);
            tiles.add(k);
          }
        }
        // footprint never touches the avenues at plot 0
        expect(p.plotX).not.toBe(0);
        expect(p.plotY).not.toBe(0);
      }
    }
  });
  it("is deterministic and fills compactly", () => {
    expect(quadrantPlot(0)).toEqual({ i: 0, j: 0 });
    const seen = new Set<string>();
    for (let n = 0; n < 100; n++) {
      const q = quadrantPlot(n);
      const k = `${q.i},${q.j}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(nextFreePlotIndex([0, 1, 3])).toBe(2);
  });
});

describe("city atlas", async () => {
  const { generateAtlas, lotPosition, isOnLand, ATLAS_VERSION, ATLAS_W, ATLAS_H } = await import("./world/atlas");
  it("is deterministic and has capacity in every placement group", () => {
    const a = generateAtlas();
    expect(ATLAS_VERSION).toBe(3);
    expect(a.blocks.length).toBeGreaterThan(1500);
    for (const d of DISTRICTS) expect(a.lots[d.id].length).toBeGreaterThanOrEqual(20);
    expect(lotPosition("mystery", 3)).toEqual(lotPosition("mystery", 3));
  });
  it("procedural lots are never in water and keep Spaces apart across all groups", () => {
    const a = generateAtlas();
    const seen: { x: number; y: number }[] = [];
    for (const d of DISTRICTS) {
      for (let i = 0; i < 20; i++) {
        const lot = a.lots[d.id][i]!;
        const p = { x: lot[0] / a.width, y: lot[1] / a.height };
        expect(isOnLand(p.x, p.y)).toBe(true);
        for (const q of seen) expect(Math.hypot((p.x - q.x) * ATLAS_W, (p.y - q.y) * ATLAS_H)).toBeGreaterThanOrEqual(469);
        seen.push(p);
      }
    }
  });
});

describe("painted map pin spots", () => {
  it("gives every vault its own spot on land, spaced apart", async () => {
    const { ARTWORK_LOTS, lotPosition } = await import("./world/atlas");
    const { DISTRICTS } = await import("./world/layout");
    expect(ARTWORK_LOTS.length).toBeGreaterThanOrEqual(80);
    const seen = new Set<string>();
    for (let p = 0; p < 20; p++)
      for (const d of DISTRICTS) {
        const pos = lotPosition(d.id, p);
        expect(pos.x).toBeGreaterThan(0);
        expect(pos.x).toBeLessThan(1);
        seen.add(`${pos.x},${pos.y}`);
      }
    expect(seen.size).toBe(80);
    // painted-map spots are spaced at least ~420 world units apart (script uses 430)
    for (let i = 0; i < ARTWORK_LOTS.length; i++)
      for (let j = i + 1; j < ARTWORK_LOTS.length; j++)
        expect(Math.hypot((ARTWORK_LOTS[i]![0] - ARTWORK_LOTS[j]![0]) * 9000, (ARTWORK_LOTS[i]![1] - ARTWORK_LOTS[j]![1]) * 6000)).toBeGreaterThan(400);
  });
});
