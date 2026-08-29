import type { FeedDocument } from "./types.ts";

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
