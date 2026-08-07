const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function configuredAdminUserIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => UUID_PATTERN.test(item)),
  );
}

export function isAuthorizedAdmin(
  user: { id: string; email_confirmed_at?: string | null },
  configuredIds: string | undefined,
): boolean {
  return Boolean(
    user.email_confirmed_at &&
      configuredAdminUserIds(configuredIds).has(user.id.toLowerCase()),
  );
}
