import { createBrowserSession } from "./browser.ts";
import { collectUniqueItems } from "./feed-item-collection.ts";
import type {
  BrowserSession,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
} from "./types.ts";

interface BrowserFeedCaptureContext {
  browser: BrowserSession;
  limit: number;
  collectedItems: FeedItem[];
  collectItems: (
    items: unknown[],
    options?: {
      mapItem?: (item: unknown) => FeedItem | null;
      shouldInclude?: (item: FeedItem) => boolean;
    },
  ) => FeedItem[];
}

interface BrowserFeedCaptureOptions {
  sourceName: string;
  limit?: number;
  browserOptions?: FeedBrowserConfig;
  createSession?: (browserOptions: FeedBrowserConfig) => BrowserSession;
  prepareFeed: (browser: BrowserSession) => void | Promise<void>;
  captureBatch: (context: BrowserFeedCaptureContext) => void | Promise<void>;
  afterCapture?: (
    context: BrowserFeedCaptureContext & { document: FeedDocument },
  ) => void | Promise<void>;
}

async function captureBrowserFeed({
  sourceName,
  limit = 12,
  browserOptions = {},
  createSession = createBrowserSession,
  prepareFeed,
  captureBatch,
  afterCapture,
}: BrowserFeedCaptureOptions): Promise<FeedDocument> {
  const browser = createSession(browserOptions);
  const collectedItems: FeedItem[] = [];
  const seen = new Set<string>();
  const context: BrowserFeedCaptureContext = {
    browser,
    limit,
    collectedItems,
    collectItems(items, options = {}) {
      return collectUniqueItems(items, {
        seen,
        sourceName,
        target: collectedItems,
        ...options,
      });
    },
  };

  await prepareFeed(browser);
  await captureBatch(context);
  if (collectedItems.length === 0) {
    await prepareFeed(browser);
    await captureBatch(context);
  }

  const document: FeedDocument = {
    schema_version: 1,
    source: sourceName,
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
  await afterCapture?.({ ...context, document });
  return document;
}

export { captureBrowserFeed };
export type { BrowserFeedCaptureContext, BrowserFeedCaptureOptions };
