import { describe, expect, it } from "vitest";
import { parseAiCreatorDiscoveryResult } from "./aiCreatorDiscovery";

describe("parseAiCreatorDiscoveryResult", () => {
  it("accepts a names-only response", () => {
    expect(parseAiCreatorDiscoveryResult({ names: [" 博主甲 ", "博主乙"] })).toEqual({
      names: ["博主甲", "博主乙"],
    });
  });

  it("rejects missing, empty, or oversized name lists", () => {
    expect(() => parseAiCreatorDiscoveryResult({})).toThrow();
    expect(() => parseAiCreatorDiscoveryResult({ names: [] })).toThrow();
    expect(() => parseAiCreatorDiscoveryResult({ names: Array(6).fill("博主") })).toThrow();
  });
});
