import { describe, expect, it, vi } from "vitest";
import {
  analysisFailureReasonFromIssues,
  campaignSourceFromSearch,
  getOrCreateProductMetricSessionId,
  plusOfferVariantFromSessionId,
  photoSelectionEventNames,
} from "./productMetrics";

function memoryStorage(initialValue?: string) {
  const values = new Map<string, string>();
  if (initialValue) values.set("look-ai-product-metrics-session", initialValue);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("getOrCreateProductMetricSessionId", () => {
  it("reuses the anonymous session id already stored for this browser tab", () => {
    const createId = vi.fn(() => "new-session-id");

    expect(getOrCreateProductMetricSessionId(memoryStorage("existing-session-id"), createId))
      .toBe("existing-session-id");
    expect(createId).not.toHaveBeenCalled();
  });

  it("creates and persists one anonymous session id when the tab has none", () => {
    const storage = memoryStorage();
    const createId = vi.fn(() => "new-session-id");

    expect(getOrCreateProductMetricSessionId(storage, createId)).toBe("new-session-id");
    expect(getOrCreateProductMetricSessionId(storage, createId)).toBe("new-session-id");
    expect(createId).toHaveBeenCalledTimes(1);
  });
});

describe("campaignSourceFromSearch", () => {
  it.each([
    ["?src=xhs_01", "xhs_01"],
    ["?src=CREATOR_12", "creator_12"],
    ["?other=value&src=community_03", "community_03"],
  ])("accepts a fixed, non-identifying campaign code from %s", (search, expected) => {
    expect(campaignSourceFromSearch(search)).toBe(expected);
  });

  it.each([
    "?src=xhs",
    "?src=creator_name",
    "?src=community_123",
    "?src=user@example.com",
  ])("rejects an unbounded or identifying campaign value from %s", (search) => {
    expect(campaignSourceFromSearch(search)).toBeUndefined();
  });
});

describe("plusOfferVariantFromSessionId", () => {
  it.each([
    ["00000000-0000-4000-8000-000000000000", "price_9_9"],
    ["00000000-0000-4000-8000-000000000001", "price_19_9"],
    ["00000000-0000-4000-8000-000000000002", "price_29_9"],
  ] as const)("assigns %s to %s", (sessionId, expected) => {
    expect(plusOfferVariantFromSessionId(sessionId)).toBe(expected);
  });

  it("uses the middle price when the input cannot be parsed", () => {
    expect(plusOfferVariantFromSessionId("not-a-session-id")).toBe("price_19_9");
  });
});

describe("photoSelectionEventNames", () => {
  it("records the overall and women-specific events for the women reference mode", () => {
    expect(photoSelectionEventNames("women")).toEqual([
      "photo_selected",
      "women_photo_selected",
    ]);
  });

  it("also records the men-specific event for the men reference mode", () => {
    expect(photoSelectionEventNames("men")).toEqual([
      "photo_selected",
      "men_photo_selected",
    ]);
  });
});

describe("analysisFailureReasonFromIssues", () => {
  it.each([
    ["no-face", "no_face"],
    ["multiple-faces", "multiple_faces"],
    ["too-dark", "too_dark"],
    ["too-small", "pose_issue"],
    ["tilted", "pose_issue"],
    ["side-facing", "pose_issue"],
    ["expressive-mouth", "pose_issue"],
  ] as const)("maps %s to %s", (code, expected) => {
    expect(analysisFailureReasonFromIssues([{ code }])).toBe(expected);
  });

  it("uses the first displayed quality issue when a photo has several issues", () => {
    expect(analysisFailureReasonFromIssues([
      { code: "too-dark" },
      { code: "tilted" },
    ])).toBe("too_dark");
  });

  it("returns no reason when photo quality passed", () => {
    expect(analysisFailureReasonFromIssues([])).toBeUndefined();
  });
});
