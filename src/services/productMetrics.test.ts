import { describe, expect, it, vi } from "vitest";
import { getOrCreateProductMetricSessionId } from "./productMetrics";

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
