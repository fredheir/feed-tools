export const DEFAULT_CAPTURE_LIMIT = 12;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function parseCaptureLimit(value: unknown, label = "limit"): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }

  const text = String(value);
  if (!POSITIVE_INTEGER.test(text)) {
    throw new Error(`Invalid ${label}: ${text}`);
  }

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${text}`);
  }
  return parsed;
}
