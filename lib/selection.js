"use strict";

const fs = require("node:fs");
const { assertFeedDocument } = require("./item-shape");

/**
 * @typedef {import("./item-shape").FeedDocument} FeedDocument
 * @typedef {import("./item-shape").FeedItem} FeedItem
 * @typedef {Object} SelectionRow
 * @property {number} row
 * @property {FeedItem} item
 * @typedef {string|Array<string>} SelectionSpec
 */

function loadDocument(inputPath) {
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

/**
 * @param {FeedDocument} document
 * @returns {SelectionRow[]}
 */
function buildRows(document) {
  assertFeedDocument(document, "buildRows");

  return document.items.map((item, index) => ({
    row: index + 1,
    item,
  }));
}

function summarizeText(value, maxLength = 110) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * @param {SelectionSpec} spec
 * @returns {string[]}
 */
function normalizeSelectionSpec(spec) {
  if (Array.isArray(spec)) {
    return spec.map((value) => String(value).trim()).filter(Boolean);
  }

  return String(spec || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function printRows(document, { limit } = {}) {
  const rows = buildRows(document);
  const selectedRows =
    Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  return selectedRows
    .map(({ row, item }) => {
      const stats = item?.stats || {};
      return [
        row,
        item?.id || "",
        item?.author?.handle || "",
        summarizeText(item?.content?.text || ""),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
      ].join("\t");
    })
    .join("\n");
}

function printRowsWithAllocation(document, allocation, options = {}) {
  const {
    limit,
    unclassifiedOnly = false,
    fallbackCategory = "Other",
  } = options;
  let rows = buildRows(document);
  if (unclassifiedOnly) {
    rows = rows.filter(
      ({ item }) => !allocation?.items || !allocation.items[item?.id]?.category,
    );
  }
  const selectedRows =
    Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  return selectedRows
    .map(({ row, item }) => {
      const stats = item?.stats || {};
      const category =
        allocation?.items?.[item?.id]?.category || fallbackCategory;
      return [
        row,
        item?.id || "",
        category,
        item?.author?.handle || "",
        summarizeText(item?.content?.text || ""),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
      ].join("\t");
    })
    .join("\n");
}

function printClassificationRows(document, allocation, options = {}) {
  const { limit } = options;
  let rows = buildRows(document).filter(
    ({ item }) => !allocation?.items || !allocation.items[item?.id]?.category,
  );
  if (Number.isInteger(limit) && limit > 0) {
    rows = rows.slice(0, limit);
  }
  return rows
    .map(({ row, item }) => {
      const stats = item?.stats || {};
      return [
        row,
        item?.source || document.source || "",
        item?.id || "",
        item?.author?.handle || "",
        summarizeText(item?.content?.text || "", 140),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
        item?.url || "",
      ].join("\t");
    })
    .join("\n");
}

function buildClassificationPrompt(curation = {}) {
  const categories = Array.isArray(curation.preferred_categories)
    ? curation.preferred_categories.filter(Boolean)
    : [];
  const fallback = curation.fallback_category || "Other";
  const categoryLine =
    categories.length > 0
      ? `Requested categories: ${categories.join(", ")}. Fallback: ${fallback}.`
      : `Requested categories: ${fallback}.`;
  return `ERROR: classification step incomplete. ${categoryLine} Please classify each post below against the config curation preferences and relevance policy, then run feed-classify --category Label:rows with explicit row assignments only.`;
}

function resolveSelectionToken(document, token) {
  const value = String(token).trim();
  if (!value) return null;

  const rows = buildRows(document);
  if (/^\d+$/.test(value)) {
    const row = Number.parseInt(value, 10);
    return rows.find((entry) => entry.row === row)?.item?.id || null;
  }

  return rows.find((entry) => entry.item?.id === value)?.item?.id || null;
}

/**
 * @param {FeedDocument} document
 * @param {SelectionSpec} spec
 * @returns {string[]}
 */
function resolveSelectionList(document, spec) {
  const tokens = normalizeSelectionSpec(spec);
  const allRows = buildRows(document)
    .map((entry) => entry.item?.id)
    .filter(Boolean);

  if (tokens.length === 1 && tokens[0].toLowerCase() === "all") {
    return allRows;
  }

  const explicit = tokens
    .filter((value) => value.toLowerCase() !== "all")
    .map((value) => resolveSelectionToken(document, value))
    .filter(Boolean);

  if (!tokens.some((value) => value.toLowerCase() === "all")) {
    return explicit;
  }

  const seen = new Set(explicit);
  const remaining = allRows.filter((id) => !seen.has(id));
  return explicit.concat(remaining);
}

module.exports = {
  buildClassificationPrompt,
  buildRows,
  loadDocument,
  printClassificationRows,
  printRowsWithAllocation,
  resolveSelectionList,
};
