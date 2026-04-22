"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { combineDocuments } = require("./document-ops.js");
const { normalizePersistedDocument } = require("./feed-document-normalize.js");
import { getPreferredItemKey } from "./item-shape.js";
import { hasPositiveLimit } from "./selection.js";
import type { FeedAllocation, FeedDocument, FeedItem } from "./types.js";

type SqliteDatabase = InstanceType<typeof DatabaseSync>;

interface SourceDocumentRow {
  source: string;
  document_json: string;
}

interface DocumentJsonRow {
  document_json?: string;
}

interface ItemTableInfoRow {
  name: string;
}

interface ItemStateRow {
  item_key: string;
  is_seen: number;
  is_completed: number;
}

interface ItemCategoryRow {
  item_key: string;
  item_id: string;
  source: string;
  category: string;
  category_updated_at: string | null;
}

interface CaptureOptions {
  snapshotPath?: string | null;
  latestPath?: string | null;
}

interface ExportOptions {
  sources?: string[];
  limit?: number | null;
  excludeSeen?: boolean;
  excludeCompleted?: boolean;
}

interface ItemState {
  is_seen: boolean;
  is_completed: boolean;
}

type CategoryMapEntry = FeedAllocation["items"][string];

function normalizeStoredDocument(
  document: unknown,
  options: {
    context: string;
    fallbackSource?: string;
  },
): FeedDocument {
  return normalizePersistedDocument(document, {
    context: options.context,
    fallbackSource: options.fallbackSource,
    includeCaptureMetadata: true,
  });
}

function getDatabasePath(saveDir: string): string {
  return path.join(saveDir, "feed.sqlite");
}

function openDatabase(saveDir: string): SqliteDatabase {
  fs.mkdirSync(saveDir, { recursive: true });
  const db = new DatabaseSync(getDatabasePath(saveDir));
  initializeSchema(db);
  return db;
}

function initializeSchema(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS source_documents (
      source TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      snapshot_path TEXT,
      latest_path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      item_key TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      item_id TEXT,
      source_item_id TEXT,
      url TEXT,
      payload_json TEXT NOT NULL,
      first_seen_at TEXT,
      last_seen_at TEXT,
      capture_count INTEGER NOT NULL DEFAULT 1,
      is_seen INTEGER NOT NULL DEFAULT 0,
      seen_at TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      last_capture_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS capture_items (
      capture_id INTEGER NOT NULL,
      item_key TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (capture_id, item_key)
    );

    CREATE INDEX IF NOT EXISTS idx_items_source_last_seen
      ON items(source, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_source_seen
      ON items(source, is_seen, is_completed);
    CREATE INDEX IF NOT EXISTS idx_capture_items_position
      ON capture_items(capture_id, position);
  `);
  ensureItemsColumns(db);
}

function ensureItemsColumns(db: SqliteDatabase): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info('items')`).all() as ItemTableInfoRow[]).map(
      (row) => row.name,
    ),
  );

  if (!columns.has("category")) {
    db.exec(`ALTER TABLE items ADD COLUMN category TEXT`);
  }
  if (!columns.has("category_updated_at")) {
    db.exec(`ALTER TABLE items ADD COLUMN category_updated_at TEXT`);
  }
}

function parseDocumentRow(
  row: DocumentJsonRow | undefined,
): FeedDocument | null {
  if (!row?.document_json) return null;
  return normalizeStoredDocument(JSON.parse(row.document_json) as unknown, {
    context: "sqlite-store",
  });
}

function listStoredSourceRows(db: SqliteDatabase): SourceDocumentRow[] {
  return db
    .prepare(
      `SELECT source, document_json
       FROM source_documents
       ORDER BY source ASC`,
    )
    .all() as SourceDocumentRow[];
}

function loadCurrentDocumentFromDb(
  saveDir: string,
  sourceName: string,
): FeedDocument | null {
  const db = openDatabase(saveDir);
  try {
    const row = db
      .prepare(
        `SELECT document_json
         FROM source_documents
         WHERE source = ?`,
      )
      .get(sourceName) as DocumentJsonRow | undefined;
    return parseDocumentRow(row);
  } finally {
    db.close();
  }
}

function listStoredSources(saveDir: string): string[] {
  const db = openDatabase(saveDir);
  try {
    return listStoredSourceRows(db).map((row) => row.source);
  } finally {
    db.close();
  }
}

function persistSourceDocument(
  saveDir: string,
  {
    sourceName,
    document,
    snapshotPath = null,
    latestPath = null,
  }: { sourceName: string; document: FeedDocument } & CaptureOptions,
): number {
  const db = openDatabase(saveDir);
  try {
    const normalizedBaseDocument = normalizeStoredDocument(document, {
      context: "persistSourceDocument",
      fallbackSource: sourceName,
    });
    const normalizedDocument: FeedDocument = {
      ...normalizedBaseDocument,
      captured_at:
        normalizedBaseDocument.captured_at || new Date().toISOString(),
    };
    const captureInsert = db.prepare(
      `INSERT INTO captures (source, captured_at, snapshot_path, latest_path)
       VALUES (?, ?, ?, ?)`,
    );
    const sourceUpsert = db.prepare(
      `INSERT INTO source_documents (source, captured_at, document_json, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(source) DO UPDATE SET
         captured_at = excluded.captured_at,
         document_json = excluded.document_json,
         updated_at = excluded.updated_at`,
    );
    const itemUpsert = db.prepare(
      `INSERT INTO items (
         item_key,
         source,
         item_id,
         source_item_id,
         url,
         payload_json,
         first_seen_at,
         last_seen_at,
         capture_count,
         is_seen,
         seen_at,
         is_completed,
         completed_at,
         last_capture_id,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(item_key) DO UPDATE SET
         source = excluded.source,
         item_id = excluded.item_id,
         source_item_id = excluded.source_item_id,
         url = excluded.url,
         payload_json = excluded.payload_json,
         first_seen_at = COALESCE(items.first_seen_at, excluded.first_seen_at),
         last_seen_at = excluded.last_seen_at,
         capture_count = excluded.capture_count,
         last_capture_id = excluded.last_capture_id,
         updated_at = excluded.updated_at`,
    );
    const captureItemInsert = db.prepare(
      `INSERT INTO capture_items (capture_id, item_key, position)
       VALUES (?, ?, ?)`,
    );

    db.exec("BEGIN");
    const capture = captureInsert.run(
      sourceName,
      normalizedDocument.captured_at,
      snapshotPath,
      latestPath,
    ) as { lastInsertRowid: number | bigint };
    const captureId = Number(capture.lastInsertRowid);
    sourceUpsert.run(
      sourceName,
      normalizedDocument.captured_at,
      JSON.stringify(normalizedDocument),
    );

    for (const [index, item] of normalizedDocument.items.entries()) {
      const itemKey = getPreferredItemKey(item, {
        source: item.source || sourceName,
        index: item.index ?? index + 1,
      });
      itemUpsert.run(
        itemKey,
        item.source || sourceName,
        item.id || null,
        item.source_item_id || null,
        item.url || null,
        JSON.stringify(item),
        item.first_seen_at || normalizedDocument.captured_at,
        item.last_seen_at || normalizedDocument.captured_at,
        Number.isInteger(item.capture_count) ? item.capture_count : 1,
        0,
        null,
        0,
        null,
        captureId,
      );
      captureItemInsert.run(captureId, itemKey, index + 1);
    }

    db.exec("COMMIT");
    return captureId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

function applyStateFilters(
  document: FeedDocument,
  itemStateByKey: Map<string, ItemState>,
  options: ExportOptions = {},
): FeedDocument {
  const {
    excludeSeen = false,
    excludeCompleted = false,
    limit = null,
  } = options;
  let items: FeedItem[] = document.items;
  if (excludeSeen || excludeCompleted) {
    items = items.filter((item, index) => {
      const itemKey = getPreferredItemKey(item, {
        source: item.source || document.source,
        index: item.index ?? index + 1,
      });
      const state = itemStateByKey.get(itemKey) || null;
      if (excludeSeen && state?.is_seen) return false;
      if (excludeCompleted && state?.is_completed) return false;
      return true;
    });
  }
  if (hasPositiveLimit(limit)) {
    items = items.slice(0, limit);
  }
  return {
    ...document,
    items,
  };
}

function loadItemStateMap(
  db: SqliteDatabase,
  sources: string[],
): Map<string, ItemState> {
  const placeholders = sources.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT item_key, is_seen, is_completed
       FROM items
       WHERE source IN (${placeholders})`,
    )
    .all(...sources) as ItemStateRow[];
  return new Map(
    rows.map((row) => [
      row.item_key,
      {
        is_seen: Boolean(row.is_seen),
        is_completed: Boolean(row.is_completed),
      },
    ]),
  );
}

function loadItemCategoryMap(
  db: SqliteDatabase,
  sources: string[],
): Map<string, CategoryMapEntry> {
  const placeholders = sources.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT item_key, item_id, source, category, category_updated_at
       FROM items
       WHERE source IN (${placeholders})
         AND item_id IS NOT NULL
         AND category IS NOT NULL`,
    )
    .all(...sources) as ItemCategoryRow[];
  return new Map(
    rows.map((row) => [
      row.item_key,
      {
        source: row.source,
        category: row.category,
        updated_at: row.category_updated_at || undefined,
      },
    ]),
  );
}

function exportDocumentsFromDb(
  saveDir: string,
  options: ExportOptions = {},
): FeedDocument {
  const {
    sources = [],
    limit = null,
    excludeSeen = false,
    excludeCompleted = false,
  } = options;
  const db = openDatabase(saveDir);
  try {
    const selectedSources =
      sources.length > 0
        ? sources
        : listStoredSourceRows(db).map((row) => row.source);

    if (selectedSources.length === 0) {
      return {
        schema_version: 1,
        source: sources.length === 1 ? sources[0] : "combined",
        captured_at: null,
        items: [],
      };
    }

    const placeholders = selectedSources.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT source, document_json
         FROM source_documents
         WHERE source IN (${placeholders})`,
      )
      .all(...selectedSources) as SourceDocumentRow[];
    const docsBySource = new Map(
      rows.map((row) => [
        row.source,
        normalizeStoredDocument(JSON.parse(row.document_json) as unknown, {
          context: "exportDocumentsFromDb",
          fallbackSource: row.source,
        }),
      ]),
    );
    const documents = selectedSources
      .map((source) => docsBySource.get(source))
      .filter((document): document is FeedDocument => Boolean(document));
    const stateByKey = loadItemStateMap(db, selectedSources);

    if (documents.length === 1) {
      return applyStateFilters(documents[0], stateByKey, {
        excludeSeen,
        excludeCompleted,
        limit,
      });
    }

    return applyStateFilters(combineDocuments(documents), stateByKey, {
      excludeSeen,
      excludeCompleted,
      limit,
    });
  } finally {
    db.close();
  }
}

function loadAllocationFromDb(
  saveDir: string,
  document: FeedDocument,
): FeedAllocation {
  const sources =
    document.source === "combined"
      ? Array.from(
          new Set(
            document.items
              .map((item) => item.source)
              .filter((source): source is string => Boolean(source)),
          ),
        )
      : [document.source].filter((source): source is string => Boolean(source));
  const db = openDatabase(saveDir);
  try {
    const categoriesByItemKey =
      sources.length > 0 ? loadItemCategoryMap(db, sources) : new Map();
    const items: FeedAllocation["items"] = {};
    for (const [index, item] of document.items.entries()) {
      if (!item.id) continue;
      const itemKey = getPreferredItemKey(item, {
        source: item.source || document.source,
        index: item.index ?? index + 1,
      });
      const entry = categoriesByItemKey.get(itemKey);
      if (entry) items[item.id] = entry;
    }
    return {
      version: 1,
      source: document.source || null,
      items,
    };
  } finally {
    db.close();
  }
}

function saveAllocationToDb(
  saveDir: string,
  document: FeedDocument,
  allocation: FeedAllocation,
): void {
  const db = openDatabase(saveDir);
  try {
    const update = db.prepare(
      `UPDATE items
       SET category = ?,
           category_updated_at = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE item_key = ?`,
    );
    db.exec("BEGIN");
    for (const [index, item] of document.items.entries()) {
      if (!item.id) continue;
      const entry = allocation.items[item.id] || null;
      if (!entry?.category) continue;
      const itemKey = getPreferredItemKey(item, {
        source: item.source || document.source,
        index: item.index ?? index + 1,
      });
      update.run(
        entry.category,
        entry.updated_at || new Date().toISOString(),
        itemKey,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

export {
  exportDocumentsFromDb,
  getDatabasePath,
  listStoredSources,
  loadCurrentDocumentFromDb,
  loadAllocationFromDb,
  persistSourceDocument,
  saveAllocationToDb,
};

module.exports = {
  exportDocumentsFromDb,
  getDatabasePath,
  listStoredSources,
  loadCurrentDocumentFromDb,
  loadAllocationFromDb,
  persistSourceDocument,
  saveAllocationToDb,
};
