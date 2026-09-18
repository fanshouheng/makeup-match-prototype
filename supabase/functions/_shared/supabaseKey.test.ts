import { describe, expect, it } from "vitest";
import { firstKeyFromCollection } from "./supabaseKey";

describe("Supabase key collection parsing", () => {
  it("returns the first non-empty string from the managed collection", () => {
    expect(firstKeyFromCollection(JSON.stringify({ publishable: "", secret: "key-value" }))).toBe("key-value");
  });

  it("rejects missing, malformed, and non-string collections", () => {
    expect(firstKeyFromCollection(undefined)).toBeUndefined();
    expect(firstKeyFromCollection("not-json")).toBeUndefined();
    expect(firstKeyFromCollection(JSON.stringify({ one: 1, two: null }))).toBeUndefined();
  });
});
