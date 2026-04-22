"use strict";

const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { downloadDocumentAssets } = require("./assets");
const { closeBrowserSession, normalizeBrowserOptions } = require("./browser");
const { DEFAULT_SAVE_DIR } = require("./config");
const { buildNormalizedFeedDocument } = require("./feed-document-normalize.js");
const { getPreferredItemKey, normalizeItemShape } = require("./item-shape");
const { mergeDocuments } = require("./merge");
const {
  loadAllocationFromDb,
  loadCurrentDocumentFromDb,
  persistSourceDocument,
} = require("./sqlite-store");
const { ensureSourceStorage, getSourceStoragePaths } = require("./storage");
import type {
  FeedDocument,
  FeedItem,
  NormalizedBrowserOptions,
} from "./types.js";

interface CaptureAdapter {
  name: string;
  captureDocument: (options: {
    limit: number;
    browserOptions: NormalizedBrowserOptions;
  }) => Promise<FeedDocument>;
}

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

class CaptureAccessError extends Error {
  sourceName: string;

  constructor(sourceName: string, message: string) {
    super(message);
    this.name = "CaptureAccessError";
    this.sourceName = sourceName;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    browserOptions?: Record<string, unknown>;
  } = {},
): Promise<FeedDocument> {
  const {
    limit = 12,
    assetsDir = "",
    saveDir = DEFAULT_SAVE_DIR,
    browserOptions = {},
  } = options;
  const normalizedBrowserOptions = normalizeBrowserOptions(browserOptions);
  const shouldResetSession =
    normalizedBrowserOptions.session &&
    normalizedBrowserOptions.autoConnect === false &&
    (normalizedBrowserOptions.statePath || normalizedBrowserOptions.profile);

  if (shouldResetSession) {
    closeBrowserSession(normalizedBrowserOptions);
  }

  const document = await adapter.captureDocument({
    limit,
    browserOptions: normalizedBrowserOptions,
  });
  const normalizedDocument = normalizeDocument(document, adapter.name);
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
  options: {
    blockedUrlPatterns?: RegExp[];
    blockedTextPatterns?: RegExp[];
  } = {},
): void {
  if (document.items.length > 0) return;

  const { blockedUrlPatterns = [], blockedTextPatterns = [] } = options;
  const currentUrl = browser.getCurrentUrl() || "";
  const pageText = browser.snapshotText(["-c"], 5000) || "";

  const blockedByUrl = blockedUrlPatterns.some((pattern) =>
    pattern.test(currentUrl),
  );
  const blockedByText = blockedTextPatterns.some((pattern) =>
    pattern.test(pageText),
  );

  if (blockedByUrl || blockedByText) {
    throw new CaptureAccessError(
      sourceName,
      `Capture failed for ${sourceName}: authentication or feed access was not confirmed`,
    );
  }
}

function assertFeedPageAccessible(
  { sourceName, browser }: CaptureAccessContext,
  options: {
    blockedUrlPatterns?: RegExp[];
    blockedTextPatterns?: RegExp[];
  } = {},
): void {
  const { blockedUrlPatterns = [], blockedTextPatterns = [] } = options;
  const currentUrl = browser.getCurrentUrl() || "";
  const pageText = browser.snapshotText(["-c"], 5000) || "";

  const blockedByUrl = blockedUrlPatterns.some((pattern) =>
    pattern.test(currentUrl),
  );
  const blockedByText = blockedTextPatterns.some((pattern) =>
    pattern.test(pageText),
  );

  if (blockedByUrl || blockedByText) {
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
  const { blockedUrlPatterns = [] } = options;
  const currentUrl = browser.getCurrentUrl() || "";
  const blockedByUrl = blockedUrlPatterns.some((pattern) =>
    pattern.test(currentUrl),
  );

  if (blockedByUrl) {
    throw new CaptureAccessError(
      sourceName,
      `Capture failed for ${sourceName}: blocked page state was detected before extraction`,
    );
  }
}

function collectUniqueItems<T extends { index?: number | null }>(
  items: unknown[],
  {
    seen,
    sourceName,
    target = [],
    mapItem = (item: unknown) => item as T | null,
    shouldInclude = () => true,
  }: {
    seen: Set<string>;
    sourceName: string;
    target?: T[];
    mapItem?: (item: unknown) => T | null;
    shouldInclude?: (item: T) => boolean;
  },
): T[] {
  for (const rawItem of items || []) {
    const item = mapItem(rawItem);
    if (!item || !shouldInclude(item)) continue;
    const key = getPreferredItemKey(item, {
      source: sourceName,
      index: item.index,
    });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
  return target;
}

function hasNewUnclassifiedItems(
  document: FeedDocument,
  saveDir: string,
): boolean {
  const allocation = loadAllocationFromDb(
    saveDir || DEFAULT_SAVE_DIR,
    document,
  );
  return document.items.some(
    (item) =>
      item.capture_count === 1 &&
      item.last_seen_at === document.captured_at &&
      Boolean(item.id) &&
      !allocation?.items?.[item.id as string]?.category,
  );
}

module.exports = {
  CaptureAccessError,
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  assertFeedUrlAccessible,
  collectUniqueItems,
  hasNewUnclassifiedItems,
  normalizeDocument,
  persistCapturedDocument,
  runSourceCapture,
};
