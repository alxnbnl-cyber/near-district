import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CATALOGUE,
  definitionHash,
  evaluateRule,
  hasFreePath,
  leaves,
  toTokenUnits,
  validateActivity,
  validateRule,
  describeActivity,
  type ActivityLeaf,
  type RuleNode,
} from "./activities";

const ORG = "11111111-1111-4111-8111-111111111111";
const CAMP = "22222222-2222-4222-8222-222222222222";
const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

const quiz: ActivityLeaf = { kind: "activity", id: "quiz", ownerOrgId: ORG, activity: { type: "internal_quiz", campaignId: CAMP } };
const lend: ActivityLeaf = { kind: "activity", id: "lend", ownerOrgId: ORG, activity: { type: "near_rhea_lending_supply", network: "mainnet", tokenId: USDC, minAmount: "5000000" } };
const seq: ActivityLeaf = { kind: "activity", id: "seq", ownerOrgId: ORG, activity: { type: "internal_question_sequence", campaignId: CAMP, questionCount: 2 } };

describe("hint rule engine", () => {
  it("ANY unlocks on one verified requirement, ALL needs every one", () => {
    const any: RuleNode = { kind: "group", op: "ANY", children: [quiz, lend] };
    const all: RuleNode = { kind: "group", op: "ALL", children: [quiz, seq] };
    expect(evaluateRule(any, new Set())).toBe(false);
    expect(evaluateRule(any, new Set(["lend"]))).toBe(true);
    expect(evaluateRule(all, new Set(["quiz"]))).toBe(false);
    expect(evaluateRule(all, new Set(["quiz", "seq"]))).toBe(true);
  });

  it("evaluates nested groups", () => {
    const nested: RuleNode = { kind: "group", op: "ALL", children: [seq, { kind: "group", op: "ANY", children: [quiz, lend] }] };
    expect(validateRule(nested)).toEqual([]);
    expect(evaluateRule(nested, new Set(["seq"]))).toBe(false);
    expect(evaluateRule(nested, new Set(["seq", "lend"]))).toBe(true);
    expect(leaves(nested).map((l) => l.id)).toEqual(["seq", "quiz", "lend"]);
  });

  it("rejects unexposed operators, duplicate ids, empty groups and depth overflow", () => {
    expect(validateRule({ kind: "group", op: "COUNT" as never, children: [quiz] }).join()).toMatch(/isn't available/);
    expect(evaluateRule({ kind: "group", op: "COUNT" as never, children: [quiz] }, new Set(["quiz"]))).toBe(false);
    expect(validateRule({ kind: "group", op: "ANY", children: [quiz, { ...quiz }] }).join()).toMatch(/unique/);
    expect(validateRule({ kind: "group", op: "ANY", children: [] }).join()).toMatch(/at least one/);
    const deep: RuleNode = { kind: "group", op: "ANY", children: [{ kind: "group", op: "ANY", children: [{ kind: "group", op: "ANY", children: [quiz] }] }] };
    expect(validateRule(deep).join()).toMatch(/nested/);
  });

  it("refuses unsupported catalogue entries and bad parameters", () => {
    expect(validateActivity({ type: "meteor_swap" } as never).join()).toMatch(/isn't supported/);
    expect(validateActivity({ type: "near_rhea_lending_supply", network: "mainnet", tokenId: "token.rhealab.near", minAmount: "1" }).join()).toMatch(/isn't listed/);
    expect(validateActivity({ type: "near_rhea_swap", network: "mainnet", minAmountIn: "5" }).join()).toMatch(/specific input token/);
    expect(validateActivity({ type: "near_rhea_swap", network: "mainnet", tokenIn: "fake.near" }).join()).toMatch(/approved list/);
    expect(ACTIVITY_CATALOGUE.filter((e) => e.support !== "not_supported").map((e) => e.type)).not.toContain("meteor_swap");
  });

  it("knows whether a free path exists", () => {
    expect(hasFreePath({ kind: "group", op: "ANY", children: [quiz, lend] })).toBe(true);
    expect(hasFreePath({ kind: "group", op: "ALL", children: [quiz, lend] })).toBe(false);
    expect(hasFreePath(lend)).toBe(false);
  });

  it("hashes definitions independent of key order and converts token units exactly", () => {
    expect(definitionHash({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(definitionHash({ b: [2, { d: 4, c: 3 }], a: 1 }));
    expect(toTokenUnits(USDC, "12.5")).toBe("12500000");
    expect(() => toTokenUnits(USDC, "0.0000001")).toThrow();
    expect(describeActivity(lend.activity)).toBe("Supply at least 5 USDC to RHEA Lending");
  });
});
