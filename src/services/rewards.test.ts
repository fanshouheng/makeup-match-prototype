import { describe, expect, it } from "vitest";
import {
  buildReferralUrl,
  captureReferralCode,
  freeSuccessfulMatchesRemaining,
  normalizeReferralCode,
  readLocalSuccessfulMatches,
  recordLocalSuccessfulMatch,
  resolveWomenMatchAccess,
} from "./rewards";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("local successful match quota", () => {
  it("counts only explicit successful records and caps the free quota at three", () => {
    const storage = memoryStorage();
    expect(readLocalSuccessfulMatches(storage)).toBe(0);
    expect(recordLocalSuccessfulMatch(storage)).toBe(1);
    expect(recordLocalSuccessfulMatch(storage)).toBe(2);
    expect(recordLocalSuccessfulMatch(storage)).toBe(3);
    expect(recordLocalSuccessfulMatch(storage)).toBe(3);
    expect(freeSuccessfulMatchesRemaining(3)).toBe(0);
  });

  it("keeps local and referral balances untouched while Plus is active", () => {
    expect(resolveWomenMatchAccess(0, true, { matchCredits: 4, pendingReferral: false }))
      .toEqual({ mode: "plus", consumeBonus: false });
    expect(resolveWomenMatchAccess(3, true, { matchCredits: 0, pendingReferral: false }))
      .toEqual({ mode: "plus", consumeBonus: false });
  });

  it("falls back to local and referral access without active Plus", () => {
    expect(resolveWomenMatchAccess(2, false))
      .toEqual({ mode: "local", consumeBonus: false });
    expect(resolveWomenMatchAccess(3, false, { matchCredits: 2, pendingReferral: false }))
      .toEqual({ mode: "referral", consumeBonus: true });
    expect(resolveWomenMatchAccess(3, false, { matchCredits: 0, pendingReferral: true }))
      .toEqual({ mode: "referral", consumeBonus: false });
    expect(resolveWomenMatchAccess(3, false, { matchCredits: 0, pendingReferral: false }))
      .toEqual({ mode: "blocked", consumeBonus: false });
  });
});

describe("referral links", () => {
  it("captures only a valid referral code", () => {
    const storage = memoryStorage();
    expect(captureReferralCode("?ref=abc123def4", storage)).toBe("ABC123DEF4");
    expect(captureReferralCode("?ref=bad-code", storage)).toBeUndefined();
  });

  it("builds a start link without leaking account ids", () => {
    expect(buildReferralUrl("https://makeup.example/", "ABC123DEF4"))
      .toBe("https://makeup.example/?ref=ABC123DEF4#start");
    expect(normalizeReferralCode(" abc123def4 ")).toBe("ABC123DEF4");
  });
});
