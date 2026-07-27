const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_CHARACTER_COUNT = 12;

export function inviteCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < INVITE_CHARACTER_COUNT) {
    throw new Error("invite_random_bytes_too_short");
  }

  const characters = Array.from(
    bytes.slice(0, INVITE_CHARACTER_COUNT),
    (byte) => INVITE_ALPHABET[byte & 31],
  );
  return `MAKEUP-${characters.slice(0, 4).join("")}-${characters.slice(4, 8).join("")}-${characters.slice(8).join("")}`;
}

export function generateInviteCode(): string {
  return inviteCodeFromBytes(crypto.getRandomValues(new Uint8Array(INVITE_CHARACTER_COUNT)));
}

export function normalizeInviteCode(value: string): string | undefined {
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  const match = compact.match(/^MAKEUP([2-9A-HJ-NP-Z]{12})$/);
  if (!match) return undefined;
  const characters = match[1];
  return `MAKEUP-${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8)}`;
}

export async function hashInviteCode(code: string): Promise<string> {
  const normalized = normalizeInviteCode(code);
  if (!normalized) throw new Error("invite_invalid");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
