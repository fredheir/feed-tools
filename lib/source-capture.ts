import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { downloadDocumentAssets } from "./assets.ts";
import { closeBrowserSession, normalizeBrowserOptions } from "./browser.ts";
import { DEFAULT_SAVE_DIR } from "./config.ts";
import { buildNormalizedFeedDocument } from "./feed-document-normalize.ts";
import { normalizeItemShape } from "./item-shape.ts";
import { mergeDocuments } from "./merge.ts";
import {
  loadCurrentDocumentFromDb,
  persistSourceDocument,
} from "./sqlite-store.ts";
import { ensureSourceStorage, getSourceStoragePaths } from "./storage.ts";
import { isRecord } from "./coerce.ts";
import type {
  CaptureAdapter,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
} from "./types.ts";

interface PersistOptions {
  sourceName: string;
  assetsDir: string;
  saveDir: string;
}

interface CaptureAccessContext {
  sourceName: string;
  browser: {
    getCurrentUrl: () => string;
    snapshotText: (args: string[], timeoutMs: number) => string;
  };
  document?: FeedDocument;
}

interface CaptureAccessPolicy {
  blockedUrlPatterns?: RegExp[];
  blockedTextPatterns?: RegExp[];
}

class CaptureAccessError extends Error {
  sourceName: string;

  constructor(sourceName: string, message: string) {
    super(message);
    this.name = "CaptureAccessError";
    this.sourceName = sourceName;
  }
}

function assertMatchingSource(
  value: unknown,
  sourceName: string,
  context: string,
): void {
  if (value == null) return;
  if (typeof value !== "string" || value !== sourceName) {
    throw new Error(
      `Invalid ${sourceName} capture document: ${context} must match source "${sourceName}"`,
    );
  }
}

function assertCapturedAtValue(value: unknown, sourceName: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(
      `Invalid ${sourceName} capture document: captured_at must be a string or null`,
    );
  }
}

function normalizeItem(
  item: unknown,
  fallback: { source: string; index: number },
): FeedItem {
  if (!isRecord(item)) {
    throw new Error(
      `Invalid ${fallback.source} capture document: item ${fallback.index} must be an object`,
    );
  }
  assertMatchingSource(
    item.source,
    fallback.source,
    `item ${fallback.index} source`,
  );
  return normalizeItemShape(item, fallback);
}

function normalizeDocument(
  document: unknown,
  sourceName: string,
): FeedDocument {
  if (!isRecord(document) || !Array.isArray(document.items)) {
    throw new Error(`Invalid ${sourceName} capture document`);
  }

  if (document.schema_version !== undefined && document.schema_version !== 1) {
    throw new Error(
      `Invalid ${sourceName} capture document: schema_version must be 1`,
    );
  }

  assertMatchingSource(document.source, sourceName, "document source");
  assertCapturedAtValue(document.captured_at, sourceName);

  return buildNormalizedFeedDocument(document, {
    source: sourceName,
    schemaVersion: 1,
    capturedAt:
      typeof document.captured_at === "string" && document.captured_at
        ? document.captured_at
        : new Date().toISOString(),
    normalizeItem,
  });
}

function assertStandardizedDocument(
  document: FeedDocument,
  sourceName: string,
): void {
  if (document.schema_version !== 1) {
    throw new Error(
      `Invalid ${sourceName} standardized document: schema_version must be 1`,
    );
  }
  if (document.source !== sourceName) {
    throw new Error(
      `Invalid ${sourceName} standardized document: document source must match source "${sourceName}"`,
    );
  }
  if (typeof document.captured_at !== "string" || !document.captured_at) {
    throw new Error(
      `Invalid ${sourceName} standardized document: captured_at must be a non-empty string`,
    );
  }
  for (let index = 0; index < document.items.length; index += 1) {
    const item = document.items[index];
    if (item.source !== sourceName) {
      throw new Error(
        `Invalid ${sourceName} standardized document: item ${index + 1} source must match source "${sourceName}"`,
      );
    }
  }
}

function assertNonEmptyCapture(
  document: FeedDocument,
  sourceName: string,
): void {
  if (document.items.length > 0) return;
  throw new Error(
    `Capture failed for ${sourceName}: no items were extracted. Check authentication, selectors, and source-specific page state before rendering.`,
  );
}

async function persistCapturedDocument(
  document: FeedDocument,
  { sourceName, assetsDir, saveDir }: PersistOptions,
): Promise<FeedDocument> {
  assertStandardizedDocument(document, sourceName);
  let normalized = document;
  if (assetsDir) {
    normalized = await downloadDocumentAssets(normalized, assetsDir);
  }

  const paths = getSourceStoragePaths(
    saveDir,
    sourceName,
    normalized.captured_at || new Date().toISOString(),
  );
  ensureSourceStorage(paths);
  const serialized = JSON.stringify(normalized, null, 2);
  await Promise.all([
    fsPromises.writeFile(paths.snapshotPath, serialized),
    fsPromises.writeFile(paths.latestPath, serialized),
  ]);

  let existingCurrent = loadCurrentDocumentFromDb(saveDir, sourceName);
  if (!existingCurrent) {
    try {
      existingCurrent = normalizeDocument(
        JSON.parse(fs.readFileSync(paths.currentPath, "utf8")) as unknown,
        sourceName,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const merged = mergeDocuments(existingCurrent, normalized);
  await fsPromises.writeFile(
    paths.currentPath,
    JSON.stringify(merged, null, 2),
  );
  persistSourceDocument(saveDir, {
    sourceName,
    document: merged,
    snapshotPath: paths.snapshotPath,
    latestPath: paths.latestPath,
  });
  return merged;
}

async function runSourceCapture(
  adapter: CaptureAdapter,
  options: {
    limit?: number;
    assetsDir?: string;
    saveDir?: string;
    browserOptions?: FeedBrowserConfig;
  } = {},
): Promise<FeedDocument> {
  const {
    limit = 12,
    assetsDir = "",
    saveDir = DEFAULT_SAVE_DIR,
    browserOptions = {},
  } = options;
  const normalizedBrowserOptions = normalizeBrowserOptions(browserOptions);
  const shouldResetSession: boolean = Boolean(
    normalizedBrowserOptions.session &&
      normalizedBrowserOptions.autoConnect === false &&
      (normalizedBrowserOptions.statePath || normalizedBrowserOptions.profile),
  );

  if (shouldResetSession) {
    closeBrowserSession(normalizedBrowserOptions);
  }

  const document = await adapter.captureDocument({
    limit,
    browserOptions: normalizedBrowserOptions,
  });
  const normalizedDocument = normalizeDocument(document, adapter.name);
  assertNonEmptyCapture(normalizedDocument, adapter.name);
  return persistCapturedDocument(normalizedDocument, {
    sourceName: adapter.name,
    assetsDir,
    saveDir,
  });
}

function assertAuthenticatedCapture(
  {
    sourceName,
    browser,
    document,
  }: CaptureAccessContext & { document: FeedDocument },
  options: CaptureAccessPolicy = {},
): void {
  if (document.items.length > 0) return;

  if (isBlockedCaptureAccess(browser, options)) {
    throw new CaptureAccessError(
      sourceName,
      `Capture failed for ${sourceName}: authentication or feed access was not confirmed`,
    );
  }
}

function assertFeedPageAccessible(
  { sourceName, browser }: CaptureAccessContext,
  options: CaptureAccessPolicy = {},
): void {
  if (isBlockedCaptureAccess(browser, options)) {
    throw new CaptureAccessError(
      sourceName,
      `Capture failed for ${sourceName}: blocked page state was detected before extraction`,
    );
  }
}

function assertFeedUrlAccessible(
  { sourceName, browser }: CaptureAccessContext,
  options: { blockedUrlPatterns?: RegExp[] } = {},
): void {
  if (matchesAnyPattern(options.blockedUrlPatterns, browser.getCurrentUrl())) {
    throw new CaptureAccessError(
      sourceName,
      `Capture failed for ${sourceName}: blocked page state was detected before extraction`,
    );
  }
}

function isBlockedCaptureAccess(
  browser: CaptureAccessContext["browser"],
  { blockedUrlPatterns = [], blockedTextPatterns = [] }: CaptureAccessPolicy,
): boolean {
  return (
    matchesAnyPattern(blockedUrlPatterns, browser.getCurrentUrl()) ||
    matchesAnyPattern(blockedTextPatterns, browser.snapshotText(["-c"], 5000))
  );
}

function matchesAnyPattern(
  patterns: RegExp[] | undefined,
  value: string | null | undefined,
): boolean {
  const text = value || "";
  return Boolean(patterns?.some((pattern) => pattern.test(text)));
}

export {
  CaptureAccessError,
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  assertFeedUrlAccessible,
  assertNonEmptyCapture,
  normalizeDocument,
  persistCapturedDocument,
  runSourceCapture,
};
