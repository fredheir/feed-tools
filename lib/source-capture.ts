"use strict";

const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { downloadDocumentAssets } = require("./assets");
const { closeBrowserSession, normalizeBrowserOptions } = require("./browser");
const { DEFAULT_SAVE_DIR } = require("./config");
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

function normalizeItem(
  item: unknown,
  index: number,
  sourceName: string,
): FeedItem {
  return normalizeItemShape(item, { source: sourceName, index: index + 1 });
}

function normalizeDocument(
  document: unknown,
  sourceName: string,
): FeedDocument {
  if (
    !document ||
    typeof document !== "object" ||
    !Array.isArray((document as { items?: unknown[] }).items)
  ) {
    throw new Error(`Invalid ${sourceName} capture document`);
  }

  const sourceDocument = document as {
    captured_at?: string | null;
    items: unknown[];
  };

  return {
    schema_version: 1,
    source: sourceName,
    captured_at: sourceDocument.captured_at || new Date().toISOString(),
    items: sourceDocument.items.map((item, index) =>
      normalizeItem(item, index, sourceName),
    ),
  };
}

async function persistCapturedDocument(
  document: FeedDocument,
  { sourceName, assetsDir, saveDir }: PersistOptions,
): Promise<FeedDocument> {
  let normalized = normalizeDocument(document, sourceName);
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
  return persistCapturedDocument(document, {
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
