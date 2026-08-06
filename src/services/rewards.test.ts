import { describe, expect, it } from "vitest";
import {
  buildReferralUrl,
  captureReferralCode,
  freeSuccessfulMatchesRemaining,
  normalizeReferralCode,
  readLocalSuccessfulMatches,
  recordLocalSuccessfulMatch,
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
