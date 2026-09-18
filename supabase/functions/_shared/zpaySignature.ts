import { createHash } from "node:crypto";

export function zpaySignText(params: Record<string, string>, key: string): string {
  return Object.entries(params)
    .filter(([name, value]) => name !== "sign" && name !== "sign_type" && value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`)
    .join("&") + key;
}

export function zpaySign(params: Record<string, string>, key: string): string {
  return createHash("md5").update(zpaySignText(params, key), "utf8").digest("hex");
}

export function verifyZpaySignature(params: Record<string, string>, key: string): boolean {
  const received = params.sign?.toLowerCase();
  if (!received || !/^[0-9a-f]{32}$/.test(received)) return false;
  const expected = zpaySign(params, key);
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
