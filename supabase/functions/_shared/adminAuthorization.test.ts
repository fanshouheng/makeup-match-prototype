import { describe, expect, it } from "vitest";
import { configuredAdminUserIds, isAuthorizedAdmin } from "./adminAuthorization";

const ADMIN_ID = "8d54ef64-2104-4fbc-9763-2f271a8d65e7";

describe("admin authorization", () => {
  it("accepts only configured UUIDs", () => {
    expect(configuredAdminUserIds(` invalid, ${ADMIN_ID.toUpperCase()} `)).toEqual(
      new Set([ADMIN_ID]),
    );
  });

  it("requires a confirmed account with the configured immutable user id", () => {
    expect(isAuthorizedAdmin({
      id: ADMIN_ID,
      email_confirmed_at: "2026-08-07T00:00:00Z",
    }, ADMIN_ID)).toBe(true);
    expect(isAuthorizedAdmin({ id: ADMIN_ID, email_confirmed_at: null }, ADMIN_ID)).toBe(false);
    expect(isAuthorizedAdmin({
      id: "3578456d-c353-4dd0-9d1b-d9c274717cef",
      email_confirmed_at: "2026-08-07T00:00:00Z",
    }, ADMIN_ID)).toBe(false);
  });
});
