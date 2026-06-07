import { spawnSync } from "node:child_process";
import path from "node:path";

import { getDefaultDocumentPath } from "./document-paths.ts";
import type { FeedDocument, FeedSourceName } from "./types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 50 * 1024 * 1024;

interface RunBinOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

interface RunBinResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface CaptureSourcesOptions {
  sources: FeedSourceName[];
  limit?: number;
  assetsDir?: string;
  saveDir?: string;
  timeoutMs?: number;
}

export interface CaptureSourcesResult {
  ok: boolean;
  document: FeedDocument;
  sourceCounts: Record<string, number>;
  itemCount: number;
  stderr: string;
}

export interface CurateWorksetOptions {
  outputPath?: string;
  sources?: FeedSourceName[];
  saveDir?: string;
  limit?: number;
  excludeSeen?: boolean;
  excludeCompleted?: boolean;
  matches?: string[];
  timeoutMs?: number;
}

export interface CurateWorksetResult {
  ok: boolean;
  requiresClassification: boolean;
  outputPath: string | null;
  stdout: string;
  stderr: string;
}

export interface CategoryAssignmentInput {
  category: string;
  rows: string;
}

export interface ClassifyRowsOptions {
  inputPath?: string;
  saveDir?: string;
  assignments: CategoryAssignmentInput[];
  timeoutMs?: number;
}

export interface ClassifyRowsResult {
  ok: boolean;
  sqlitePath: string;
  stdout: string;
  stderr: string;
}

export interface RenderFeedOptions {
  inputPath?: string;
  outputPath?: string;
  pick?: string;
  tab?: boolean;
  summary?: string;
  open?: boolean;
  timeoutMs?: number;
}

export interface RenderFeedResult {
  ok: boolean;
  htmlPath: string;
  stdout: string;
  stderr: string;
}

function runBin(
  name: string,
  args: string[],
  options: RunBinOptions = {},
): RunBinResult {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", name), ...args],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, ...(options.env || {}) },
    },
  );
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function pushOptionalFlag(
  args: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value) args.push(flag, value);
}

export function buildCaptureArgs(options: CaptureSourcesOptions): string[] {
  if (options.sources.length === 0) {
    throw new Error("Provide at least one source");
  }
  const args = [...options.sources];
  if (typeof options.limit === "number") args.push(String(options.limit));
  pushOptionalFlag(args, "--assets-dir", options.assetsDir);
  pushOptionalFlag(args, "--save-dir", options.saveDir);
  return args;
}

export function captureSources(
  options: CaptureSourcesOptions,
): CaptureSourcesResult {
  const result = runBin("feed-capture", buildCaptureArgs(options), {
    timeoutMs: options.timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "feed-capture failed");
  }
  const document = JSON.parse(result.stdout) as FeedDocument;
  const sourceCounts: Record<string, number> = {};
  for (const item of document.items || []) {
    sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
  }
  return {
    ok: true,
    document,
    sourceCounts,
    itemCount: document.items.length,
    stderr: result.stderr,
  };
}

export function buildCurateArgs(options: CurateWorksetOptions = {}): string[] {
  const args: string[] = [];
  if (options.outputPath) args.push(options.outputPath);
  if (options.sources && options.sources.length > 0) {
    args.push("--sources", options.sources.join(","));
  }
  pushOptionalFlag(args, "--save-dir", options.saveDir);
  if (typeof options.limit === "number") {
    args.push("--limit", String(options.limit));
  }
  if (options.excludeSeen) args.push("--exclude-seen");
  if (options.excludeCompleted) args.push("--exclude-completed");
  if (options.matches && options.matches.length > 0) {
    args.push("--matches", options.matches.join(","));
  }
  return args;
}

export function curateWorkset(
  options: CurateWorksetOptions = {},
): CurateWorksetResult {
  const result = runBin("feed-curate", buildCurateArgs(options), {
    timeoutMs: options.timeoutMs,
  });
  if (result.status !== 0 && result.status !== 2) {
    throw new Error(result.stderr || result.stdout || "feed-curate failed");
  }
  const firstLine = result.stdout.split(/\r?\n/).find(Boolean) || null;
  return {
    ok: result.status === 0,
    requiresClassification: result.status === 2,
    outputPath: firstLine,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function buildClassifyArgs(options: ClassifyRowsOptions): string[] {
  if (options.assignments.length === 0) {
    throw new Error("Use at least one category assignment");
  }
  const args: string[] = [];
  if (options.inputPath) args.push(options.inputPath);
  pushOptionalFlag(args, "--save-dir", options.saveDir);
  for (const assignment of options.assignments) {
    args.push("--category", `${assignment.category}:${assignment.rows}`);
  }
  return args;
}

export function classifyRows(
  options: ClassifyRowsOptions,
): ClassifyRowsResult {
  const result = runBin("feed-classify", buildClassifyArgs(options), {
    timeoutMs: options.timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "feed-classify failed");
  }
  return {
    ok: true,
    sqlitePath: result.stdout.trim(),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function buildRenderArgs(options: RenderFeedOptions = {}): string[] {
  const args: string[] = [];
  if (options.inputPath) {
    args.push(options.inputPath);
  } else if (options.outputPath) {
    args.push(getDefaultDocumentPath());
  }
  if (options.outputPath) args.push(options.outputPath);
  pushOptionalFlag(args, "--pick", options.pick);
  if (options.tab) args.push("--tab");
  pushOptionalFlag(args, "--summary", options.summary);
  if (options.open !== true) args.push("--no-open");
  return args;
}

export function renderFeed(options: RenderFeedOptions = {}): RenderFeedResult {
  const result = runBin("feed-render", buildRenderArgs(options), {
    timeoutMs: options.timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "feed-render failed");
  }
  return {
    ok: true,
    htmlPath: result.stdout.trim(),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
