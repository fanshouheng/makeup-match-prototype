import { describe, expect, it } from "vitest";
import { clientIpFromRequest, hashRateKey } from "./rateLimit";

describe("rate limit identity", () => {
  it("uses the address appended by the trusted platform proxy", () => {
    const request = new Request("https://example.test", {
      headers: {
        "cf-connecting-ip": "203.0.113.99",
        "x-forwarded-for": "198.51.100.10, 192.0.2.4",
      },
    });
    expect(clientIpFromRequest(request)).toBe("192.0.2.4");
  });

  it("does not trust a caller-provided Cloudflare header", () => {
    const request = new Request("https://example.test", {
      headers: { "cf-connecting-ip": "203.0.113.99" },
    });
    expect(clientIpFromRequest(request)).toBeUndefined();
  });

  it("hashes without retaining the source value", async () => {
    const hash = await hashRateKey("ip:192.0.2.4", "test-salt");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("192.0.2.4");
  });
});
