const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface AdminMetricsRange {
  startAt: string;
  endBefore: string;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

export function resolveAdminMetricsRange(
  startDate: unknown,
  endDate: unknown,
  now = new Date(),
): AdminMetricsRange | undefined {
  if (startDate === undefined && endDate === undefined) {
    return {
      startAt: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
      endBefore: now.toISOString(),
    };
  }

  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !isIsoDate(startDate) ||
    !isIsoDate(endDate) ||
    startDate > endDate
  ) {
    return undefined;
  }

  const startAt = new Date(`${startDate}T00:00:00Z`).getTime() - BEIJING_OFFSET_MS;
  const endBefore = new Date(`${endDate}T00:00:00Z`).getTime() - BEIJING_OFFSET_MS + DAY_MS;
  return {
    startAt: new Date(startAt).toISOString(),
    endBefore: new Date(endBefore).toISOString(),
  };
}
