"use strict";

const fs = require("node:fs");

function loadDocument(inputPath) {
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

function buildRows(document) {
  if (!Array.isArray(document.items)) {
    throw new Error("Expected standardized feed document with .items array");
  }

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

function printRows(document, { limit } = {}) {
  const rows = buildRows(document);
  const selectedRows =
    Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  return selectedRows
    .map(({ row, item }) => {
      const stats = item.stats || {};
      return [
        row,
        item.id || "",
        item.author?.handle || "",
        summarizeText(item.content?.text || ""),
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
      ({ item }) => !allocation?.items || !allocation.items[item.id]?.category,
    );
  }
  const selectedRows =
    Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  return selectedRows
    .map(({ row, item }) => {
      const stats = item.stats || {};
      const category =
        allocation?.items?.[item.id]?.category || fallbackCategory;
      return [
        row,
        item.id || "",
        category,
        item.author?.handle || "",
        summarizeText(item.content?.text || ""),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
      ].join("\t");
    })
    .join("\n");
}

function printClassificationRows(document, allocation, options = {}) {
  const { limit } = options;
  let rows = buildRows(document).filter(
    ({ item }) => !allocation?.items || !allocation.items[item.id]?.category,
  );
  if (Number.isInteger(limit) && limit > 0) {
    rows = rows.slice(0, limit);
  }
  return rows
    .map(({ row, item }) => {
      const stats = item.stats || {};
      return [
        row,
        item.source || document.source || "",
        item.id || "",
        item.author?.handle || "",
        summarizeText(item.content?.text || "", 140),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
        item.url || "",
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
  return `ERROR: classification step incomplete. ${categoryLine} Please classify each post below against the config curation preferences and relevance policy; respond concisely with --category Label:rows assignments only.`;
}

function resolveSelectionToken(document, token) {
  const value = String(token).trim();
  if (!value) return null;

  const rows = buildRows(document);
  if (/^\d+$/.test(value)) {
    const row = Number.parseInt(value, 10);
    return rows.find((entry) => entry.row === row)?.item?.id || null;
  }

  return rows.find((entry) => entry.item.id === value)?.item?.id || null;
}

function resolveSelectionList(document, spec) {
  if (
    String(spec || "")
      .trim()
      .toLowerCase() === "all"
  ) {
    return buildRows(document)
      .map((entry) => entry.item?.id)
      .filter(Boolean);
  }
  return String(spec || "")
    .split(",")
    .map((value) => resolveSelectionToken(document, value))
    .filter(Boolean);
}

module.exports = {
  buildClassificationPrompt,
  buildRows,
  loadDocument,
  printClassificationRows,
  printRows,
  printRowsWithAllocation,
  resolveSelectionList,
};
