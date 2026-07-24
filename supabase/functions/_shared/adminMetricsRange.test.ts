import { describe, expect, it } from "vitest";
import { isIsoDate, resolveAdminMetricsRange } from "../admin-review/adminMetricsRange";

describe("admin metrics date range", () => {
  it("covers complete Beijing calendar days with an exclusive end boundary", () => {
    expect(resolveAdminMetricsRange("2026-07-20", "2026-07-22")).toEqual({
      startAt: "2026-07-19T16:00:00.000Z",
      endBefore: "2026-07-22T16:00:00.000Z",
    });
  });

  it("covers a single selected day", () => {
    expect(resolveAdminMetricsRange("2026-07-25", "2026-07-25")).toEqual({
      startAt: "2026-07-24T16:00:00.000Z",
      endBefore: "2026-07-25T16:00:00.000Z",
    });
  });

  it("rejects partial, invalid, and reversed ranges", () => {
    expect(resolveAdminMetricsRange("2026-07-20", undefined)).toBeUndefined();
    expect(resolveAdminMetricsRange("2026-02-30", "2026-03-01")).toBeUndefined();
    expect(resolveAdminMetricsRange("2026-07-22", "2026-07-20")).toBeUndefined();
    expect(isIsoDate("2026-7-20")).toBe(false);
  });

  it("preserves the rolling seven-day range for older clients", () => {
    expect(resolveAdminMetricsRange(undefined, undefined, new Date("2026-07-25T12:00:00.000Z"))).toEqual({
      startAt: "2026-07-18T12:00:00.000Z",
      endBefore: "2026-07-25T12:00:00.000Z",
    });
  });
});
