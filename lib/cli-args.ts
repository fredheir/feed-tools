export function requireArgValue(
  args: string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
