import { describe, expect, it } from "vitest";
import { verifyZpaySignature, zpaySign, zpaySignText } from "./zpaySignature";

describe("zpaySignature", () => {
  it("sorts fields and excludes sign metadata and empty values", () => {
    const params = { money: "9.90", pid: "123", sign_type: "MD5", empty: "", name: "MAKE UP Plus" };
    expect(zpaySignText(params, "secret")).toBe("money=9.90&name=MAKE UP Plus&pid=123secret");
    expect(zpaySign(params, "secret")).toBe("c53422193c464f3f81ea834a01c9548d");
  });

  it("rejects a changed callback", () => {
    const params = { money: "9.90", out_trade_no: "202609120001", pid: "123", sign_type: "MD5", trade_status: "TRADE_SUCCESS" };
    const signed = { ...params, sign: zpaySign(params, "secret") };
    expect(verifyZpaySignature(signed, "secret")).toBe(true);
    expect(verifyZpaySignature({ ...signed, money: "99.00" }, "secret")).toBe(false);
  });
});
