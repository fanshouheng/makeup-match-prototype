import { describe, expect, it, vi } from "vitest";
import {
  campaignSourceFromSearch,
  getOrCreateProductMetricSessionId,
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
