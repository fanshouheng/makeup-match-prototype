import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./stripeSignature";

async function signature(secret: string, payload: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

describe("verifyStripeSignature", () => {
  it("accepts a current valid signature", async () => {
    const now = 1_700_000_000;
    const payload = '{"id":"evt_test"}';
    const signed = await signature("whsec_test", payload, now);
    await expect(verifyStripeSignature(payload, signed, "whsec_test", now)).resolves.toBe(true);
  });

  it("rejects tampering, wrong secrets, and stale signatures", async () => {
    const now = 1_700_000_000;
    const payload = '{"id":"evt_test"}';
    const signed = await signature("whsec_test", payload, now);
    await expect(verifyStripeSignature('{"id":"evt_other"}', signed, "whsec_test", now)).resolves.toBe(false);
    await expect(verifyStripeSignature(payload, signed, "wrong", now)).resolves.toBe(false);
    await expect(verifyStripeSignature(payload, signed, "whsec_test", now + 301)).resolves.toBe(false);
  });
});
