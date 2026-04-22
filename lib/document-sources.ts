import type { FeedDocument } from "./types.js";

export function getDocumentSource(document: FeedDocument): string | null {
  const source = document?.source || null;
  return source === "combined" ? null : source;
}

export function getDocumentSources(document: FeedDocument): string[] {
  const source = document?.source || null;
  if (source === "combined") {
    return Array.from(
      new Set(
        (document.items || [])
          .map((item) => item?.source)
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  return [source].filter((value): value is string => Boolean(value));
}
