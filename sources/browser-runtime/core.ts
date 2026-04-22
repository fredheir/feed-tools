function textOf(
  node:
    | { innerText?: string | null; textContent?: string | null }
    | null
    | undefined,
): string {
  return (node?.innerText || node?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function multilineTextOf(
  node:
    | { innerText?: string | null; textContent?: string | null }
    | null
    | undefined,
): string {
  return (node?.innerText || node?.textContent || "")
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function linesOf(
  node:
    | { innerText?: string | null; textContent?: string | null }
    | null
    | undefined,
): string[] {
  return multilineTextOf(node)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeCount(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function makeAbsoluteUrl(
  url: string | null | undefined,
  base?: string,
): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function toBrowserFunctionSource(fn: (...args: never[]) => unknown): string {
  return `${fn.toString()}\n`;
}

export function buildBrowserRuntimeScript(
  limit: number,
  body: string,
  extras: Array<(...args: never[]) => unknown> = [],
): string {
  const prelude = [
    textOf,
    multilineTextOf,
    linesOf,
    normalizeCount,
    makeAbsoluteUrl,
    ...extras,
  ]
    .map(toBrowserFunctionSource)
    .join("");
  return `(() => {
    const limit = ${JSON.stringify(limit)};
    ${prelude}
    ${body}
  })()`;
}
