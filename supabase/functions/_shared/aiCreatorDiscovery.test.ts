import { describe, expect, it } from "vitest";
import {
  parseCreatorNames,
  parseProviderCreatorNames,
} from "./aiCreatorDiscovery";

describe("parseCreatorNames", () => {
  it("trims, deduplicates, and limits names", () => {
    expect(parseCreatorNames({
      names: [" 博主甲 ", "博主甲", "博主乙", "博主丙", "博主丁", "博主戊", "博主己"],
    })).toEqual(["博主甲", "博主乙", "博主丙", "博主丁", "博主戊"]);
  });

  it("does not accept URLs as names", () => {
    expect(() => parseCreatorNames({ names: ["https://example.com/user"] })).toThrow(
      "invalid_creator_names",
    );
  });
});

describe("parseProviderCreatorNames", () => {
  it("extracts JSON from the output_text response item", () => {
    expect(parseProviderCreatorNames({
      output: [
        { type: "web_search_call" },
        {
          type: "message",
          content: [{ type: "output_text", text: '{"names":["博主甲","博主乙"]}' }],
        },
      ],
    })).toEqual(["博主甲", "博主乙"]);
  });

  it("rejects malformed provider output", () => {
    expect(() => parseProviderCreatorNames({ output: [] })).toThrow(
      "invalid_provider_response",
    );
  });
});
