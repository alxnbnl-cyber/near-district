/**
 * Treasure Hunt answer rules. Correct answers never leave the server:
 * text/choice answers are stored as HMAC-SHA256 digests keyed by a server
 * pepper + per-question salt; numeric answers are stored encrypted by the
 * server layer because tolerance comparison needs the value.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type QuestionType = "short_text" | "multiple_choice" | "numeric";

export interface TextNormalization {
  trim: boolean;
  caseInsensitive: boolean;
  collapseWhitespace: boolean;
  stripPunctuation: boolean;
}

export const DEFAULT_TEXT_NORMALIZATION: TextNormalization = {
  trim: true,
  caseInsensitive: true,
  collapseWhitespace: true,
  stripPunctuation: false,
};

export function normalizeText(input: string, n: TextNormalization): string {
  let s = input.normalize("NFKC");
  if (n.trim) s = s.trim();
  if (n.collapseWhitespace) s = s.replace(/\s+/g, " ");
  if (n.caseInsensitive) s = s.toLocaleLowerCase("en-US");
  if (n.stripPunctuation) s = s.replace(/[\p{P}\p{S}]/gu, "").trim();
  return s;
}

export function answerDigest(pepper: string, salt: string, normalized: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(`${salt}\u0000${normalized}`)));
}

/** Constant-time string comparison for equal-length hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface TextRule {
  type: "short_text";
  normalization: TextNormalization;
  /** Digests of the canonical answer and every accepted alias. */
  digests: string[];
}
export interface ChoiceRule {
  type: "multiple_choice";
  /** Digest of the correct option id. */
  digest: string;
}
export interface NumericRule {
  type: "numeric";
  /** Decimal string, e.g. "3.14". Compared in fixed point, never as floats. */
  value: string;
  /** Absolute tolerance as decimal string, e.g. "0.01". */
  tolerance: string;
}
export type AnswerRule = TextRule | ChoiceRule | NumericRule;

const NUM_SCALE = 18;
const NUM_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** Parse a user-entered decimal into fixed point; accepts "1,000.5" style grouping. */
export function parseSignedFixed(input: string): bigint | null {
  const s = input.trim().replace(/[,_\s]/g, "");
  const m = NUM_RE.exec(s);
  if (!m) return null;
  const frac = m[3] ?? "";
  if (frac.length > NUM_SCALE) return null;
  const v = BigInt(m[2]! + frac.padEnd(NUM_SCALE, "0"));
  return m[1] === "-" ? -v : v;
}

export function buildTextRule(
  pepper: string,
  salt: string,
  answers: string[],
  normalization: TextNormalization = DEFAULT_TEXT_NORMALIZATION,
): TextRule {
  const normalized = [...new Set(answers.map((a) => normalizeText(a, normalization)).filter((a) => a.length > 0))];
  if (normalized.length === 0) throw new Error("A short-text question needs at least one non-empty answer");
  return { type: "short_text", normalization, digests: normalized.map((a) => answerDigest(pepper, salt, a)) };
}

export function buildChoiceRule(pepper: string, salt: string, correctOptionId: string): ChoiceRule {
  return { type: "multiple_choice", digest: answerDigest(pepper, salt, correctOptionId) };
}

export function buildNumericRule(value: string, tolerance: string): NumericRule {
  if (parseSignedFixed(value) === null) throw new Error("Numeric answer must be a decimal number");
  const tol = parseSignedFixed(tolerance);
  if (tol === null || tol < 0n) throw new Error("Tolerance must be a non-negative decimal number");
  return { type: "numeric", value, tolerance };
}

export function checkAnswer(rule: AnswerRule, submitted: string, pepper: string, salt: string): boolean {
  if (submitted.length > 500) return false;
  switch (rule.type) {
    case "short_text": {
      const d = answerDigest(pepper, salt, normalizeText(submitted, rule.normalization));
      let ok = false;
      for (const x of rule.digests) ok = timingSafeEqualHex(x, d) || ok;
      return ok;
    }
    case "multiple_choice":
      return timingSafeEqualHex(rule.digest, answerDigest(pepper, salt, submitted.trim()));
    case "numeric": {
      const got = parseSignedFixed(submitted);
      const want = parseSignedFixed(rule.value);
      const tol = parseSignedFixed(rule.tolerance);
      if (got === null || want === null || tol === null) return false;
      const diff = got > want ? got - want : want - got;
      return diff <= tol;
    }
  }
}
