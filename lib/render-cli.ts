#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
import { requireArgValue } from "./cli-args.js";
const {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
} = require("./document-paths.js");
const { loadConfig } = require("./config.js");
const {
  buildRenderArtifactMeta,
  renderDocumentToHtml,
} = require("./render-output.js");
import { createBrowserSession } from "./browser.js";
import { assertFeedDocument } from "./item-shape.js";
import type { FeedDocument } from "./types.js";

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 2
) {
  console.log(
    "Usage: feed-render [input-json] [output-html] [--pick rows|all|rows,all] [--tab] [--summary-file FILE] [--summary TEXT] [--no-open] [--dev] [--control-base-url URL] [--refresh-sources a,b] [--artifact-source-label LABEL]",
  );
  console.log(
    "  --pick order controls render order. Append ',all' to pin specific rows first and keep the remaining rows in natural row order.",
  );
  process.exit(0);
}

let inputPath = getDefaultDocumentPath();
let outputPath: string | null = null;
let pickSpec: string | null = null;
let summary: string | null = null;
let noOpen = false;
let tabbed = false;
let devMode = false;
let controlBaseUrl: string | null = null;
let refreshSources: string[] = [];
let artifactSourceLabel: string | null = null;

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--") && inputPath === getDefaultDocumentPath()) {
    inputPath = arg;
    continue;
  }
  if (arg === "--pick") {
    pickSpec = requireArgValue(process.argv, index, arg);
    index += 1;
    continue;
  }
  if (arg === "--tab") {
    tabbed = true;
    continue;
  }
  if (arg === "--summary-file") {
    const summaryPath = requireArgValue(process.argv, index, arg);
    index += 1;
    summary = fs.readFileSync(summaryPath, "utf8").trim();
    continue;
  }
  if (arg === "--summary") {
    summary = requireArgValue(process.argv, index, arg);
    index += 1;
    continue;
  }
  if (arg === "--no-open") {
    noOpen = true;
    continue;
  }
  if (arg === "--dev") {
    devMode = true;
    continue;
  }
  if (arg === "--control-base-url") {
    controlBaseUrl = requireArgValue(process.argv, index, arg);
    index += 1;
    continue;
  }
  if (arg === "--refresh-sources") {
    refreshSources = requireArgValue(process.argv, index, arg)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    index += 1;
    continue;
  }
  if (arg === "--artifact-source-label") {
    artifactSourceLabel = requireArgValue(process.argv, index, arg);
    index += 1;
    continue;
  }
  if (outputPath === null) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!outputPath)
  outputPath =
    inputPath === getDefaultDocumentPath()
      ? getDefaultHtmlPath()
      : path.resolve(inputPath).replace(/\.json$/i, ".html");
if (!outputPath) {
  throw new Error("Unable to resolve output path");
}

const rawDocument = JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown;
assertFeedDocument(rawDocument, "feed-render");
const document: FeedDocument = rawDocument;
const config = loadConfig();
const devMeta = devMode
  ? buildRenderArtifactMeta(document, {
      inputPath,
      outputPath,
      controlBaseUrl: controlBaseUrl || undefined,
      refreshSources,
      artifactSourceLabel: artifactSourceLabel || undefined,
    })
  : null;
const html = renderDocumentToHtml(document, config, {
  inputPath,
  outputPath,
  pickSpec,
  summary,
  tabbed,
  devMeta,
});
fs.writeFileSync(outputPath, html, "utf8");
if (!noOpen) {
  const browser = createBrowserSession();
  browser.openPathOrUrl(outputPath);
}
console.log(path.resolve(outputPath));
