import { describe, expect, it } from "vitest";
import { isValidPlusEmail, isValidPlusPassword } from "./plusAccountValidation";

describe("Plus account validation", () => {
  it("accepts a normal email and rejects malformed or oversized values", () => {
    expect(isValidPlusEmail("user@example.com")).toBe(true);
    expect(isValidPlusEmail("user@example")).toBe(false);
    expect(isValidPlusEmail(`user@${"a".repeat(246)}.com`)).toBe(false);
  });

  it("accepts passwords from 8 through 72 characters", () => {
    expect(isValidPlusPassword("12345678")).toBe(true);
    expect(isValidPlusPassword("a".repeat(72))).toBe(true);
    expect(isValidPlusPassword("1234567")).toBe(false);
    expect(isValidPlusPassword("a".repeat(73))).toBe(false);
  });
});
