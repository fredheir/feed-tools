import * as fs from "node:fs";
import * as path from "node:path";

export interface SourceStoragePaths {
  sourceRoot: string;
  snapshotsDir: string;
  snapshotPath: string;
  latestPath: string;
  currentPath: string;
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
}

export function getSourceStoragePaths(
  saveDir: string,
  sourceName: string,
  capturedAt: string,
): SourceStoragePaths {
  const sourceRoot = path.join(saveDir, sourceName);
  const snapshotsDir = path.join(sourceRoot, "snapshots");
  const timestamp = formatTimestamp(new Date(capturedAt));
  return {
    sourceRoot,
    snapshotsDir,
    snapshotPath: path.join(
      snapshotsDir,
      `${sourceName}-feed-${timestamp}.json`,
    ),
    latestPath: path.join(sourceRoot, "latest.json"),
    currentPath: path.join(sourceRoot, "current.json"),
  };
}

export function ensureSourceStorage(paths: SourceStoragePaths): void {
  fs.mkdirSync(paths.snapshotsDir, { recursive: true });
}
