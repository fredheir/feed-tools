export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toOptionalString(
  value: unknown,
  options: { coerce?: boolean } = {},
): string | null {
  if (value == null || value === "") return null;
  if (options.coerce === false) {
    return typeof value === "string" ? value : null;
  }
  return String(value);
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => String(entry)).filter(Boolean);
}
