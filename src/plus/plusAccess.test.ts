import { describe, expect, it, vi } from "vitest";
import { isActivePlusMembership, type PlusMembership } from "./plusAccess";

vi.mock("./plusClient", () => ({ plusClient: {} }));

const membership: PlusMembership = {
  userId: "00000000-0000-4000-8000-000000000001",
  tier: "early_access",
  status: "active",
  trialCredits: 3,
  activatedAt: "2026-08-01T00:00:00.000Z",
  benefitExpiresAt: "2027-01-28T00:00:00.000Z",
};

describe("Plus membership activity", () => {
  it("accepts only an active, unexpired membership", () => {
    const now = new Date("2026-08-27T00:00:00.000Z").getTime();
    expect(isActivePlusMembership(membership, now)).toBe(true);
    expect(isActivePlusMembership({ ...membership, status: "revoked" }, now)).toBe(false);
    expect(isActivePlusMembership({ ...membership, benefitExpiresAt: "2026-08-26T00:00:00.000Z" }, now)).toBe(false);
    expect(isActivePlusMembership(null, now)).toBe(false);
  });
});
