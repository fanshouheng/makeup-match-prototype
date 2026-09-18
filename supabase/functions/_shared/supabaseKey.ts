export function firstKeyFromCollection(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return Object.values(JSON.parse(value) as Record<string, unknown>)
      .find((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return undefined;
  }
}
