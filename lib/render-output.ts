#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  groupPickedRowsByCategory,
  loadAllocationFromDocument,
} = require("./allocation.js");
const { getCurationPreferences } = require("./config.js");
const { applyMask } = require("./mask.js");
const { renderDocument } = require("./render/html.js");
const { resolveSelectionList } = require("./selection.js");
import type { FeedConfig, FeedDocument, RenderArtifactMeta } from "./types.js";

const REPO_ROOT = path.resolve(__dirname, "..");

export function relativizeAssetPaths(
  document: FeedDocument,
  outputPath: string,
  inputPath: string,
): void {
  const resolveLocalAsset = (
    value: string | null | undefined,
  ): string | null => {
    if (!value || /^(https?:|data:|file:)/i.test(value)) return value ?? null;

    const candidates = [
      path.resolve(path.dirname(inputPath), value),
      path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value),
    ];
    const absolutePath = candidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!absolutePath) return null;

    return path
      .relative(path.dirname(outputPath), absolutePath)
      .split(path.sep)
      .join("/");
  };

  for (const item of document.items) {
    if (item.author)
      item.author.profile_image_local =
        resolveLocalAsset(item.author.profile_image_local) ?? null;
    for (const media of item.media || []) {
      media.local_src = resolveLocalAsset(media.local_src) ?? null;
      media.local_video_src = resolveLocalAsset(media.local_video_src) ?? null;
    }
    for (const card of item.cards || [])
      card.image_local = resolveLocalAsset(card.image_local) ?? null;
  }
}

export function buildRenderArtifactMeta(
  document: FeedDocument,
  options: {
    inputPath: string;
    outputPath: string;
    generatedAt?: string;
    controlBaseUrl?: string;
    refreshSources?: string[];
    artifactSourceLabel?: string;
  },
): RenderArtifactMeta {
  let localMediaCount = 0;
  let remoteMediaCount = 0;
  let pendingVideoCount = 0;

  for (const item of document.items) {
    for (const media of item.media || []) {
      if (media.local_src || media.local_video_src) {
        localMediaCount += 1;
      } else if (media.src || media.video_src) {
        remoteMediaCount += 1;
      }
      if (media.media_kind === "video" && !media.local_video_src) {
        pendingVideoCount += 1;
      }
    }
  }

  return {
    generated_at: options.generatedAt || new Date().toISOString(),
    input_path: path.resolve(options.inputPath),
    output_path: path.resolve(options.outputPath),
    captured_at: document.captured_at || null,
    local_media_count: localMediaCount,
    remote_media_count: remoteMediaCount,
    pending_video_count: pendingVideoCount,
    control_base_url: options.controlBaseUrl,
    refresh_sources:
      options.refreshSources as RenderArtifactMeta["refresh_sources"],
    artifact_source_label: options.artifactSourceLabel,
  };
}

export function prepareDocumentForRender(
  document: FeedDocument,
  config: FeedConfig,
  options: {
    pickSpec?: string | null;
    summary?: string | null;
    tabbed?: boolean;
  } = {},
): FeedDocument {
  const curation = getCurationPreferences(config);
  const allocation = loadAllocationFromDocument(document);
  const selection = options.pickSpec
    ? resolveSelectionList(document, options.pickSpec)
    : "all";
  return applyMask(document, {
    ...(options.summary ? { summary: options.summary } : {}),
    tabs: groupPickedRowsByCategory(document, allocation, selection, {
      fallbackCategory: curation.fallback_category || "Other",
      preferredCategories: curation.preferred_categories || [],
    }),
    tabbed: options.tabbed,
  });
}

export function renderDocumentToHtml(
  document: FeedDocument,
  config: FeedConfig,
  options: {
    inputPath: string;
    outputPath: string;
    pickSpec?: string | null;
    summary?: string | null;
    tabbed?: boolean;
    devMeta?: RenderArtifactMeta | null;
  },
): string {
  const preparedDocument = prepareDocumentForRender(document, config, options);
  relativizeAssetPaths(preparedDocument, options.outputPath, options.inputPath);
  return renderDocument(preparedDocument, { devMeta: options.devMeta || null });
}

module.exports = {
  buildRenderArtifactMeta,
  prepareDocumentForRender,
  relativizeAssetPaths,
  renderDocumentToHtml,
};
