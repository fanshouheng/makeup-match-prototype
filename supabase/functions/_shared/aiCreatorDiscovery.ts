interface ProviderContent {
  text?: unknown;
  type?: unknown;
}

interface ProviderOutput {
  content?: unknown;
  type?: unknown;
}

export function parseCreatorNames(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_creator_names");
  }

  const names = (value as Record<string, unknown>).names;
  if (!Array.isArray(names)) throw new Error("invalid_creator_names");

  const uniqueNames = new Map<string, string>();
  for (const value of names) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (
      !name ||
      name.length > 60 ||
      /https?:\/\/|www\.|[\r\n]/i.test(name)
    ) {
      continue;
    }
    uniqueNames.set(name.toLocaleLowerCase("zh-CN"), name);
  }

  const result = [...uniqueNames.values()].slice(0, 5);
  if (result.length === 0) throw new Error("invalid_creator_names");
  return result;
}

export function parseProviderCreatorNames(response: unknown): string[] {
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    throw new Error("invalid_provider_response");
  }

  const output = (response as Record<string, unknown>).output;
  if (!Array.isArray(output)) throw new Error("invalid_provider_response");

  const text = (output as ProviderOutput[])
    .filter((item) => item?.type === "message" && Array.isArray(item.content))
    .flatMap((item) => item.content as ProviderContent[])
    .find((item) => item?.type === "output_text" && typeof item.text === "string")
    ?.text;
  if (typeof text !== "string") throw new Error("invalid_provider_response");

  try {
    return parseCreatorNames(JSON.parse(text));
  } catch {
    throw new Error("invalid_provider_response");
  }
}
