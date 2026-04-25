import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

export function getDefaultDocumentPath(): string {
  return path.join(REPO_ROOT, "var", "feed.json");
}

export function getDefaultHtmlPath(): string {
  return path.join(REPO_ROOT, "var", "feed.html");
}

export function getDefaultMaskPath(inputPath?: string | null): string {
  const resolved = path.resolve(inputPath || getDefaultDocumentPath());
  if (resolved.endsWith(".json")) {
    return `${resolved.slice(0, -".json".length)}.mask.json`;
  }
  return `${resolved}.mask.json`;
}
