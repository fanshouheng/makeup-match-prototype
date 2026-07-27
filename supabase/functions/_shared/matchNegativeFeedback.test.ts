import { describe, expect, it } from "vitest";
import {
  MATCH_ALGORITHM_VERSION,
  parseMatchNegativeFeedback,
  summarizeMatchNegativeFeedback,
} from "./matchNegativeFeedback";

const creatorIds = [
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000001",
];

describe("parseMatchNegativeFeedback", () => {
  it("accepts only the disclosed fields and removes recommendation order", () => {
    expect(parseMatchNegativeFeedback({
      algorithmVersion: MATCH_ALGORITHM_VERSION,
      creatorIds,
      otherReason: "  还想按眼妆问题找教程  ",
      reasonCodes: ["other", "creator_mismatch"],
    })).toEqual({
      algorithmVersion: MATCH_ALGORITHM_VERSION,
      creatorIds: [...creatorIds].sort(),
      otherReason: "还想按眼妆问题找教程",
      reasonCodes: ["creator_mismatch", "other"],
    });
  });

  it.each([
    { algorithmVersion: "unknown", creatorIds, reasonCodes: ["creator_mismatch"] },
    { algorithmVersion: MATCH_ALGORITHM_VERSION, creatorIds: [], reasonCodes: ["creator_mismatch"] },
    { algorithmVersion: MATCH_ALGORITHM_VERSION, creatorIds: ["not-a-uuid"], reasonCodes: ["creator_mismatch"] },
    { algorithmVersion: MATCH_ALGORITHM_VERSION, creatorIds, reasonCodes: [] },
    { algorithmVersion: MATCH_ALGORITHM_VERSION, creatorIds, reasonCodes: ["free_form"] },
    { algorithmVersion: MATCH_ALGORITHM_VERSION, creatorIds, reasonCodes: ["creator_mismatch"], otherReason: "not allowed here" },
  ])("rejects an invalid structured feedback payload", (payload) => {
    expect(parseMatchNegativeFeedback(payload)).toBeUndefined();
  });
});

describe("summarizeMatchNegativeFeedback", () => {
  it("counts valid responses once and each selected reason once", () => {
    expect(summarizeMatchNegativeFeedback([
      { reason_codes: ["analysis_incorrect", "creator_mismatch"] },
      { reason_codes: ["creator_mismatch", "creator_mismatch"] },
      { reason_codes: [] },
      { reason_codes: null },
    ])).toEqual({
      valid_responses: 2,
      reasons: {
        analysis_incorrect: 1,
        creator_mismatch: 2,
        style_mismatch: 0,
        problem_not_solved: 0,
        other: 0,
      },
    });
  });
});
