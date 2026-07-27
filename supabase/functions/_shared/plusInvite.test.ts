import { describe, expect, it } from "vitest";
import {
  hashInviteCode,
  inviteCodeFromBytes,
  normalizeInviteCode,
} from "./plusInvite";

describe("Plus invite codes", () => {
  it("creates a grouped code without ambiguous characters", () => {
    expect(inviteCodeFromBytes(new Uint8Array(12))).toBe("MAKEUP-2222-2222-2222");
    expect(inviteCodeFromBytes(new Uint8Array(12).fill(31))).toBe("MAKEUP-ZZZZ-ZZZZ-ZZZZ");
  });

  it("normalizes user input before redemption", () => {
    expect(normalizeInviteCode(" makeup-abcd efgh jkmn ")).toBe("MAKEUP-ABCD-EFGH-JKMN");
    expect(normalizeInviteCode("MAKEUP-ABCI-EFGH-JKMN")).toBeUndefined();
    expect(normalizeInviteCode("not-an-invite")).toBeUndefined();
  });

  it("hashes equivalent representations identically", async () => {
    await expect(hashInviteCode("makeup-abcd-efgh-jkmn")).resolves.toBe(
      await hashInviteCode("MAKEUP ABCD EFGH JKMN"),
    );
  });
});
