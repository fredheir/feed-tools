#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  getCaptureBrowserOptions,
  getCaptureDefaults,
  getDefaultSource,
  getEnabledSourceNames,
  getSaveDir,
  loadConfig,
  resolveCanonicalSaveDir,
} = require("./config.js");
const {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
} = require("./document-paths.js");
const { createBrowserSession } = require("./browser.js");
const { getCaptureHandler } = require("./source-registry.js");
const {
  exportDocumentsFromDb,
  loadAllocationFromDb,
} = require("./sqlite-store.js");
const {
  buildClassificationPrompt,
  buildRows,
  printClassificationRows,
} = require("./selection.js");
const {
  renderDocumentToHtml,
  buildRenderArtifactMeta,
} = require("./render-output.js");
const { enrichSourceVideos } = require("./video-enrich.ts");
import { requireArgValue } from "./cli-args.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FeedConfig, FeedSourceName } from "./types.js";

type RefreshState =
  | "idle"
  | "queued"
  | "capturing"
  | "rendering"
  | "needs_classification"
  | "downloading_video"
  | "done"
  | "error";

interface SourceStatus {
  source: FeedSourceName;
  label: string;
  status: RefreshState;
  message: string;
  updated_at: string;
}

interface CliOptions {
  sources: FeedSourceName[];
  worksetPath: string;
  htmlPath: string;
  saveDir: string;
  port: number;
  noOpen: boolean;
  serve: boolean;
  downloadVideoOverride: boolean | null;
}

function usage(): void {
  console.log(
    "Usage: feed-refresh-render <source|all> [--workset FILE] [--output-html FILE] [--save-dir DIR] [--port N] [--serve] [--no-open] [--download-video|--no-download-video]",
  );
}

function parseArgs(config: FeedConfig): CliOptions {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    usage();
    process.exit(0);
  }

  const requested = args.shift();
  const enabledSources = getEnabledSourceNames(config) as FeedSourceName[];
  const sources =
    requested === "all"
      ? enabledSources
      : ([requested].filter(Boolean) as FeedSourceName[]);
  if (sources.length === 0) {
    const fallback = getDefaultSource(config);
    if (!fallback) {
      throw new Error("No enabled sources configured");
    }
    sources.push(fallback as FeedSourceName);
  }

  let worksetPath = getDefaultDocumentPath();
  let htmlPath = getDefaultHtmlPath();
  let saveDir = getSaveDir(config);
  let port = 4871;
  let noOpen = false;
  let serve = false;
  let downloadVideoOverride: boolean | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--workset") {
      worksetPath = requireArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-html") {
      htmlPath = requireArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--save-dir") {
      saveDir = resolveCanonicalSaveDir(
        config,
        requireArgValue(args, index, arg),
      );
      index += 1;
      continue;
    }
    if (arg === "--port") {
      const parsed = Number.parseInt(requireArgValue(args, index, arg), 10);
      if (Number.isNaN(parsed)) {
        throw new Error("Invalid --port value");
      }
      port = parsed;
      index += 1;
      continue;
    }
    if (arg === "--serve") {
      serve = true;
      continue;
    }
    if (arg === "--no-open") {
      noOpen = true;
      continue;
    }
    if (arg === "--download-video") {
      downloadVideoOverride = true;
      continue;
    }
    if (arg === "--no-download-video") {
      downloadVideoOverride = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    sources,
    worksetPath: path.resolve(worksetPath),
    htmlPath: path.resolve(htmlPath),
    saveDir,
    port,
    noOpen,
    serve,
    downloadVideoOverride,
  };
}

function getSourceLabel(source: FeedSourceName): string {
  return source === "x" ? "X" : source[0].toUpperCase() + source.slice(1);
}

function createStatusMap(
  sources: FeedSourceName[],
): Map<FeedSourceName, SourceStatus> {
  return new Map(
    sources.map((source) => [
      source,
      {
        source,
        label: getSourceLabel(source),
        status: "idle" as RefreshState,
        message: "Idle",
        updated_at: new Date().toISOString(),
      },
    ]),
  );
}

function hasUnclassifiedRows(
  document: ReturnType<typeof exportDocumentsFromDb>,
  saveDir: string,
): boolean {
  const allocation = loadAllocationFromDb(saveDir, document);
  return buildRows(document).some(
    ({ item }: { item: { id: string | null } }) =>
      !item.id || !allocation?.items || !allocation.items[item.id]?.category,
  );
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const options = parseArgs(config);
  const statusBySource = createStatusMap(options.sources);
  let refreshQueue = Promise.resolve();

  function setStatus(
    source: FeedSourceName,
    status: RefreshState,
    message: string,
  ): void {
    statusBySource.set(source, {
      source,
      label: getSourceLabel(source),
      status,
      message,
      updated_at: new Date().toISOString(),
    });
  }

  function buildDevMeta() {
    const document = exportDocumentsFromDb(options.saveDir, {
      sources: options.sources,
    });
    return buildRenderArtifactMeta(document, {
      inputPath: options.worksetPath,
      outputPath: options.htmlPath,
      controlBaseUrl: options.serve
        ? `http://127.0.0.1:${options.port}`
        : undefined,
      refreshSources: options.serve ? options.sources : undefined,
      artifactSourceLabel: options.worksetPath,
    });
  }

  function rebuildArtifacts(): {
    ok: boolean;
    needsClassification: boolean;
    message: string;
  } {
    const document = exportDocumentsFromDb(options.saveDir, {
      sources: options.sources,
    });
    ensureParentDir(options.worksetPath);
    fs.writeFileSync(options.worksetPath, JSON.stringify(document, null, 2));

    if (hasUnclassifiedRows(document, options.saveDir)) {
      return {
        ok: false,
        needsClassification: true,
        message: `${buildClassificationPrompt(config.user_preferences.curation)}\n${printClassificationRows(
          document,
          loadAllocationFromDb(options.saveDir, document),
        )}`,
      };
    }

    const html = renderDocumentToHtml(document, config, {
      inputPath: options.worksetPath,
      outputPath: options.htmlPath,
      tabbed: config.user_preferences.render.show_tabs === true,
      devMeta: options.serve ? buildDevMeta() : null,
    });
    ensureParentDir(options.htmlPath);
    fs.writeFileSync(options.htmlPath, html, "utf8");
    return {
      ok: true,
      needsClassification: false,
      message: "Rendered",
    };
  }

  async function refreshSource(source: FeedSourceName): Promise<void> {
    const defaults = getCaptureDefaults(config, source);
    const assetsDir = defaults.assets_dir || "";
    const shouldDownloadVideos =
      options.downloadVideoOverride ?? defaults.download_videos !== false;
    const shouldBackgroundVideos =
      options.serve && !shouldDownloadVideos && source === "youtube";

    setStatus(source, "capturing", "Capturing feed");
    const handler = getCaptureHandler(source);
    if (!handler) {
      throw new Error(`No capture handler for ${source}`);
    }
    await handler({
      limit: defaults.default_limit ?? 12,
      assetsDir,
      saveDir: options.saveDir,
      browserOptions: getCaptureBrowserOptions(config, source),
      downloadVideos: shouldBackgroundVideos ? false : shouldDownloadVideos,
    });

    setStatus(source, "rendering", "Rebuilding workset");
    const rebuilt = rebuildArtifacts();
    if (!rebuilt.ok) {
      setStatus(source, "needs_classification", "Needs classification");
      return;
    }

    if (!shouldBackgroundVideos) {
      setStatus(source, "done", "Rendered");
      return;
    }

    setStatus(source, "downloading_video", "Downloading playable video");
    void enrichSourceVideos({
      sourceName: source,
      saveDir: options.saveDir,
      assetsDir,
    })
      .then(() => {
        const rerendered = rebuildArtifacts();
        setStatus(
          source,
          rerendered.ok ? "done" : "needs_classification",
          rerendered.ok
            ? "Rendered with playable video"
            : "Needs classification",
        );
      })
      .catch((error: unknown) => {
        setStatus(
          source,
          "error",
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  function queueRefreshSources(sources: FeedSourceName[]): void {
    for (const source of sources) {
      setStatus(source, "queued", "Queued");
    }
    refreshQueue = refreshQueue.then(async () => {
      for (const source of sources) {
        try {
          await refreshSource(source);
        } catch (error: unknown) {
          setStatus(
            source,
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    });
  }

  function serveFile(
    requestPath: string,
    response: InstanceType<typeof http.ServerResponse>,
  ): void {
    const normalizedPath = requestPath === "/" ? "/feed.html" : requestPath;
    const relativePath = normalizedPath.replace(/^\/+/, "");
    const targetPath = path.resolve(
      path.dirname(options.htmlPath),
      relativePath,
    );
    const rootDir = path.resolve(path.dirname(options.htmlPath));
    if (!targetPath.startsWith(rootDir) || !fs.existsSync(targetPath)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    const ext = path.extname(targetPath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".json"
          ? "application/json; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".css"
              ? "text/css; charset=utf-8"
              : ext === ".svg"
                ? "image/svg+xml"
                : ext === ".jpg" || ext === ".jpeg"
                  ? "image/jpeg"
                  : ext === ".png"
                    ? "image/png"
                    : ext === ".avif"
                      ? "image/avif"
                      : ext === ".webp"
                        ? "image/webp"
                        : ext === ".mp4"
                          ? "video/mp4"
                          : "application/octet-stream";
    response.setHeader("Content-Type", contentType);
    response.end(fs.readFileSync(targetPath));
  }

  if (options.serve) {
    const initial = rebuildArtifacts();
    if (!initial.ok) {
      for (const source of options.sources) {
        setStatus(source, "needs_classification", "Needs classification");
      }
    }

    const server = http.createServer(
      (request: IncomingMessage, response: ServerResponse) => {
        const method = request.method || "GET";
        const requestUrl = new URL(
          request.url || "/",
          `http://127.0.0.1:${options.port}`,
        );
        if (method === "GET" && requestUrl.pathname === "/api/status") {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              sources: Array.from(statusBySource.values()),
            }),
          );
          return;
        }
        if (method === "POST" && requestUrl.pathname === "/api/refresh-all") {
          queueRefreshSources(options.sources);
          response.statusCode = 202;
          response.end("queued");
          return;
        }
        if (
          method === "POST" &&
          requestUrl.pathname.startsWith("/api/refresh/")
        ) {
          const source = requestUrl.pathname.replace(
            "/api/refresh/",
            "",
          ) as FeedSourceName;
          if (!options.sources.includes(source)) {
            response.statusCode = 404;
            response.end("unknown source");
            return;
          }
          queueRefreshSources([source]);
          response.statusCode = 202;
          response.end("queued");
          return;
        }
        if (method === "GET") {
          serveFile(requestUrl.pathname, response);
          return;
        }
        response.statusCode = 405;
        response.end("method not allowed");
      },
    );

    server.listen(options.port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${options.port}/`;
      if (!options.noOpen) {
        createBrowserSession().openPathOrUrl(url);
      }
      process.stdout.write(`${url}\n`);
    });
    return;
  }

  queueRefreshSources(options.sources);
  await refreshQueue;
  if (!options.noOpen && fs.existsSync(options.htmlPath)) {
    createBrowserSession().openPathOrUrl(options.htmlPath);
  }
  process.stdout.write(`${options.htmlPath}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
