import fs from "node:fs";
import path from "node:path";

import { createBrowserSession } from "../browser.ts";
import { getBrowserStatus } from "../browser-status.ts";
import { startBrowser } from "../browser-launch-service.ts";
import { parseCurateRows } from "../curate-row-parser.ts";
import { runDoctor } from "../doctor-service.ts";
import {
  captureSources,
  classifyRows,
  curateWorkset,
  renderFeed,
  type CaptureSourcesResult,
  type CategoryAssignmentInput,
  type CurateWorksetResult,
} from "../pipeline-service.ts";
import {
  CHROME_PROFILE,
  SOURCE_TARGETS,
  getSigninStatus,
} from "../signin-service.ts";
import { listSupportedSources } from "../source-catalog.ts";
import type { FeedSourceName } from "../types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");
const DEFAULT_HTML_PATH = path.join(REPO_ROOT, "var", "feed.html");

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };
type JsonRecord = Record<string, unknown>;
type ToolHandler = (args: JsonRecord) => JsonValue | Promise<JsonValue>;

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonRecord;
  handler: ToolHandler;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

type JsonRpcId = string | number | null;

let outputMode: OutputMode = "jsonl";
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asArgs(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function sourceList(value: unknown): FeedSourceName[] {
  const supported = new Set(listSupportedSources());
  return stringList(value).filter((source): source is FeedSourceName =>
    supported.has(source as FeedSourceName),
  );
}

function requiredSources(value: unknown): FeedSourceName[] {
  const sources = sourceList(value);
  if (sources.length === 0) throw new Error("Provide at least one source");
  return sources;
}

function configPath(args: JsonRecord): string {
  return path.resolve(
    stringValue(args.config_path) ||
      process.env.FEED_TOOLS_CONFIG ||
      DEFAULT_CONFIG_PATH,
  );
}

function readJsonFile(filePath: string): JsonValue {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonValue;
}

function writeConfig(args: JsonRecord): JsonValue {
  const targetPath = configPath(args);
  const overwrite = booleanValue(args.overwrite) === true;
  if (fs.existsSync(targetPath) && !overwrite) {
    return {
      ok: true,
      written: false,
      path: targetPath,
      detail: "config already exists; pass overwrite=true to replace it",
    };
  }

  const templatePath =
    fs.existsSync(targetPath) && overwrite ? targetPath : EXAMPLE_CONFIG_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing config template: ${templatePath}`);
  }

  const raw = readJsonFile(templatePath);
  if (!isRecord(raw)) throw new Error("Invalid config template");
  const config = raw;
  const userPreferences = isRecord(config.user_preferences)
    ? config.user_preferences
    : {};
  config.user_preferences = asJson(userPreferences);
  const sources = Array.isArray(userPreferences.sources)
    ? userPreferences.sources
    : [];
  userPreferences.sources = asJson(sources);

  const sourceSpecs = Array.isArray(args.sources) ? args.sources : [];
  const sourceSpecByName = new Map<string, JsonRecord>();
  for (const spec of sourceSpecs) {
    if (!isRecord(spec)) continue;
    const name = stringValue(spec.name);
    if (name) sourceSpecByName.set(name, spec);
  }
  const requestedSources = new Set(sourceSpecByName.keys());
  const browser = isRecord(args.browser) ? args.browser : null;

  for (const source of sources) {
    if (!isRecord(source)) continue;
    const name = stringValue(source.name);
    if (!name) continue;
    const spec = sourceSpecByName.get(name);
    if (requestedSources.size > 0) source.enabled = requestedSources.has(name);
    if (spec) {
      if (typeof spec.enabled === "boolean") source.enabled = spec.enabled;
      if (typeof spec.default === "boolean") source.default = spec.default;
    }
    const capture = isRecord(source.capture) ? source.capture : {};
    source.capture = asJson(capture);
    if (spec && typeof spec.default_limit === "number") {
      capture.default_limit = spec.default_limit;
    }
    if (browser) capture.browser = asJson({ ...browser });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    ok: true,
    written: true,
    path: targetPath,
    sources_enabled: sources
      .filter((source): source is JsonRecord => isRecord(source))
      .filter((source) => source.enabled !== false)
      .map((source) => String(source.name || ""))
      .filter(Boolean),
    browser: asJson(browser || {}),
  };
}

function assignments(value: unknown): CategoryAssignmentInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CategoryAssignmentInput[] => {
    if (!isRecord(entry)) return [];
    const category = stringValue(entry.category);
    const rows = stringValue(entry.rows);
    if (!category || !rows) return [];
    return [{ category, rows }];
  });
}

function compactCaptureResult(result: CaptureSourcesResult): JsonObject {
  return {
    ok: result.ok,
    item_count: result.itemCount,
    source_counts: result.sourceCounts,
    source: result.document.source,
    captured_at: result.document.captured_at,
    stderr: result.stderr,
  };
}

function curateResult(value: CurateWorksetResult): JsonObject {
  return {
    ok: value.ok,
    requires_classification: value.requiresClassification,
    output_path: value.outputPath,
    rows: asJson(
      parseCurateRows(value.stdout, {
        classificationRequired: value.requiresClassification,
      }),
    ),
    stdout: value.stdout,
    stderr: value.stderr,
  };
}

function openTarget(args: JsonRecord): JsonObject {
  const target = stringValue(args.path) || DEFAULT_HTML_PATH;
  const browser = createBrowserSession({ cdp: stringValue(args.cdp) });
  browser.openPathOrUrl(target.includes("://") ? target : path.resolve(target));
  return { ok: true, opened: true, target };
}

function toolResult(value: JsonValue): JsonObject {
  return {
    content: [
      {
        type: "text",
        text: `${JSON.stringify(value, null, 2)}\n`,
      },
    ],
  };
}

function toolError(error: unknown): JsonObject {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${JSON.stringify(
          {
            ok: false,
            error: {
              code: "unexpected",
              message,
              next_actions: [],
            },
          },
          null,
          2,
        )}\n`,
      },
    ],
  };
}

const TOOLS: McpToolDefinition[] = [
  {
    name: "feed_doctor",
    description:
      "Check feed-tools dependencies, browser paths, CDP endpoints, and next actions.",
    inputSchema: {
      type: "object",
      properties: {
        cdp_ports: { type: "array", items: { type: "number" } },
        write_config: { type: "boolean" },
        force_config: { type: "boolean" },
      },
    },
    handler: (args) =>
      asJson(
        runDoctor({
          cdpPorts: Array.isArray(args.cdp_ports)
            ? args.cdp_ports.filter(
                (port): port is number => typeof port === "number",
              )
            : undefined,
          configure: booleanValue(args.write_config) === true,
          forceConfig: booleanValue(args.force_config) === true,
        }),
      ),
  },
  {
    name: "feed_browser_status",
    description: "Check whether a CDP endpoint is usable for feed capture.",
    inputSchema: {
      type: "object",
      properties: { cdp: { type: "string" } },
    },
    handler: (args) => asJson(getBrowserStatus(stringValue(args.cdp))),
  },
  {
    name: "feed_browser_start",
    description: "Start or reuse a dedicated Chrome profile with CDP.",
    inputSchema: {
      type: "object",
      properties: {
        cdp_port: { type: "number" },
        profile_dir: { type: "string" },
        chrome_bin: { type: "string" },
        urls: { type: "array", items: { type: "string" } },
        reuse_existing: { type: "boolean" },
        no_sandbox: { type: "boolean" },
      },
    },
    handler: (args) =>
      asJson(
        startBrowser({
          cdpPort: numberValue(args.cdp_port),
          profileDir: stringValue(args.profile_dir),
          chromeBin: stringValue(args.chrome_bin),
          urls: stringList(args.urls),
          reuseExisting: booleanValue(args.reuse_existing),
          noSandbox: booleanValue(args.no_sandbox),
        }),
      ),
  },
  {
    name: "feed_signin_open",
    description: "Open source login/feed pages and return auth-cookie status.",
    inputSchema: {
      type: "object",
      required: ["sources"],
      properties: {
        sources: { type: "array", items: { type: "string" } },
        cdp_port: { type: "number" },
        profile_dir: { type: "string" },
        reuse_existing: { type: "boolean" },
        no_sandbox: { type: "boolean" },
      },
    },
    handler: (args) => {
      const sources = requiredSources(args.sources);
      const profileDir = path.resolve(
        stringValue(args.profile_dir) ||
          process.env.FEED_TOOLS_CHROME_PROFILE ||
          CHROME_PROFILE,
      );
      const openedUrls = Object.fromEntries(
        sources.map((source) => [source, SOURCE_TARGETS[source].url]),
      );
      const browser = startBrowser({
        cdpPort: numberValue(args.cdp_port),
        profileDir,
        urls: Object.values(openedUrls),
        reuseExisting: booleanValue(args.reuse_existing),
        noSandbox: booleanValue(args.no_sandbox),
      });
      const auth = getSigninStatus(sources, profileDir);
      return {
        ok: true,
        cdp: browser.cdp,
        profile_dir: profileDir,
        opened_urls: openedUrls,
        auth_status: auth.status,
        instructions:
          "Complete login in the opened Chrome window, then call feed_signin_status.",
      };
    },
  },
  {
    name: "feed_signin_status",
    description: "Check source-specific auth cookies in the Chrome profile.",
    inputSchema: {
      type: "object",
      properties: {
        sources: { type: "array", items: { type: "string" } },
        profile_dir: { type: "string" },
      },
    },
    handler: (args) => {
      const sources = sourceList(args.sources);
      return asJson(
        getSigninStatus(
          sources.length > 0 ? sources : listSupportedSources(),
          stringValue(args.profile_dir) ||
            process.env.FEED_TOOLS_CHROME_PROFILE ||
            CHROME_PROFILE,
        ),
      );
    },
  },
  {
    name: "feed_config_read",
    description: "Read the active feed-tools config file, if present.",
    inputSchema: {
      type: "object",
      properties: { config_path: { type: "string" } },
    },
    handler: (args) => {
      const pathToRead = configPath(args);
      return {
        ok: true,
        path: pathToRead,
        exists: fs.existsSync(pathToRead),
        config: fs.existsSync(pathToRead) ? readJsonFile(pathToRead) : null,
      };
    },
  },
  {
    name: "feed_config_write",
    description: "Create or replace config.json from structured preferences.",
    inputSchema: {
      type: "object",
      properties: {
        config_path: { type: "string" },
        sources: { type: "array", items: { type: "object" } },
        browser: { type: "object" },
        overwrite: { type: "boolean" },
      },
    },
    handler: writeConfig,
  },
  {
    name: "feed_capture",
    description: "Capture one or more configured feed sources.",
    inputSchema: {
      type: "object",
      required: ["sources"],
      properties: {
        sources: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        assets_dir: { type: "string" },
        save_dir: { type: "string" },
        include_document: { type: "boolean" },
        timeout_ms: { type: "number" },
      },
    },
    handler: (args) => {
      const result = captureSources({
        sources: requiredSources(args.sources),
        limit: numberValue(args.limit),
        assetsDir: stringValue(args.assets_dir),
        saveDir: stringValue(args.save_dir),
        timeoutMs: numberValue(args.timeout_ms),
      });
      const summary = compactCaptureResult(result);
      if (booleanValue(args.include_document) === true) {
        summary.document = asJson(result.document);
      }
      return summary;
    },
  },
  {
    name: "feed_curate",
    description: "Export a sqlite-backed workset and compact parsed rows.",
    inputSchema: {
      type: "object",
      properties: {
        output_path: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
        save_dir: { type: "string" },
        limit: { type: "number" },
        exclude_seen: { type: "boolean" },
        exclude_completed: { type: "boolean" },
        matches: { type: "array", items: { type: "string" } },
        timeout_ms: { type: "number" },
      },
    },
    handler: (args) =>
      curateResult(
        curateWorkset({
          outputPath: stringValue(args.output_path),
          sources: sourceList(args.sources),
          saveDir: stringValue(args.save_dir),
          limit: numberValue(args.limit),
          excludeSeen: booleanValue(args.exclude_seen),
          excludeCompleted: booleanValue(args.exclude_completed),
          matches: stringList(args.matches),
          timeoutMs: numberValue(args.timeout_ms),
        }),
      ),
  },
  {
    name: "feed_classify",
    description: "Assign categories to curated feed rows.",
    inputSchema: {
      type: "object",
      required: ["assignments"],
      properties: {
        input_path: { type: "string" },
        save_dir: { type: "string" },
        assignments: { type: "array", items: { type: "object" } },
        timeout_ms: { type: "number" },
      },
    },
    handler: (args) =>
      asJson(
        classifyRows({
          inputPath: stringValue(args.input_path),
          saveDir: stringValue(args.save_dir),
          assignments: assignments(args.assignments),
          timeoutMs: numberValue(args.timeout_ms),
        }),
      ),
  },
  {
    name: "feed_render",
    description: "Render a curated feed document to local HTML.",
    inputSchema: {
      type: "object",
      properties: {
        input_path: { type: "string" },
        output_path: { type: "string" },
        pick: { type: "string" },
        tab: { type: "boolean" },
        summary: { type: "string" },
        open: { type: "boolean" },
        timeout_ms: { type: "number" },
      },
    },
    handler: (args) =>
      asJson(
        renderFeed({
          inputPath: stringValue(args.input_path),
          outputPath: stringValue(args.output_path),
          pick: stringValue(args.pick),
          tab: booleanValue(args.tab),
          summary: stringValue(args.summary),
          open: booleanValue(args.open),
          timeoutMs: numberValue(args.timeout_ms),
        }),
      ),
  },
  {
    name: "feed_open",
    description:
      "Open a rendered feed HTML file or URL in the controlled browser.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        cdp: { type: "string" },
      },
    },
    handler: openTarget,
  },
  {
    name: "feed_pipeline",
    description:
      "Capture sources and curate a workset, stopping before render if classification is required.",
    inputSchema: {
      type: "object",
      required: ["sources"],
      properties: {
        sources: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        matches: { type: "array", items: { type: "string" } },
        exclude_completed: { type: "boolean" },
        timeout_ms: { type: "number" },
      },
    },
    handler: (args) => {
      const sources = requiredSources(args.sources);
      const capture = captureSources({
        sources,
        limit: numberValue(args.limit),
        timeoutMs: numberValue(args.timeout_ms),
      });
      const curate = curateWorkset({
        sources,
        matches: stringList(args.matches),
        excludeCompleted: booleanValue(args.exclude_completed),
        timeoutMs: numberValue(args.timeout_ms),
      });
      return {
        capture: compactCaptureResult(capture),
        curate: curateResult(curate),
        blocked_on: curate.requiresClassification ? "classification" : "none",
        next_actions: curate.requiresClassification
          ? [
              "Call feed_classify with category assignments, then rerun feed_curate.",
            ]
          : ["Call feed_render to write the HTML feed."],
      };
    },
  },
];

export function listMcpTools(): Array<Omit<McpToolDefinition, "handler">> {
  return TOOLS.map(({ handler: _handler, ...tool }) => tool);
}

async function callTool(params: unknown): Promise<JsonObject> {
  if (!isRecord(params)) throw new Error("tools/call params must be an object");
  const name = stringValue(params.name);
  if (!name) throw new Error("tools/call requires a tool name");
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    return toolResult(await tool.handler(asArgs(params.arguments)));
  } catch (error) {
    return toolError(error);
  }
}

function writeRpcMessage(payload: JsonObject): void {
  const text = JSON.stringify(payload);
  if (outputMode === "framed") {
    process.stdout.write(
      `Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`,
    );
    return;
  }
  process.stdout.write(`${text}\n`);
}

function success(id: JsonRpcId, result: JsonObject): void {
  writeRpcMessage({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcId, code: number, message: string): void {
  writeRpcMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(message: JsonRpcMessage): Promise<void> {
  if (message.id === undefined || message.id === null) return;
  try {
    if (message.method === "initialize") {
      const params = isRecord(message.params) ? message.params : {};
      success(message.id, {
        protocolVersion: stringValue(params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "feed-tools", version: "0.1.0" },
      });
      return;
    }
    if (message.method === "ping") {
      success(message.id, {});
      return;
    }
    if (message.method === "tools/list") {
      success(message.id, { tools: asJson(listMcpTools()) });
      return;
    }
    if (message.method === "tools/call") {
      success(message.id, await callTool(message.params));
      return;
    }
    if (message.method === "resources/list") {
      success(message.id, { resources: [] });
      return;
    }
    if (message.method === "prompts/list") {
      success(message.id, { prompts: [] });
      return;
    }
    failure(message.id, -32601, `Method not found: ${message.method || ""}`);
  } catch (error) {
    failure(
      message.id,
      -32603,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function contentLengthFromHeader(header: string): number | null {
  const line = header
    .split(/\r?\n/)
    .find((entry) => /^content-length:/i.test(entry));
  const match = line?.match(/^content-length:\s*(\d+)\s*$/i);
  if (!match) return null;
  const length = Number.parseInt(match[1], 10);
  return Number.isInteger(length) && length >= 0 ? length : null;
}

export function dispatchJson(payload: string): void {
  try {
    void handleMessage(JSON.parse(payload) as JsonRpcMessage);
  } catch (error) {
    process.stderr.write(
      `Invalid MCP JSON-RPC payload: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}

export function framedMessage(
  buffer: Buffer<ArrayBufferLike>,
): { payload: string; rest: Buffer<ArrayBufferLike> } | null {
  const crlfHeaderEnd = buffer.indexOf("\r\n\r\n");
  const lfHeaderEnd = buffer.indexOf("\n\n");
  const hasCrlf = crlfHeaderEnd >= 0;
  const headerEnd = hasCrlf ? crlfHeaderEnd : lfHeaderEnd;
  if (headerEnd < 0) return null;
  const separatorLength = hasCrlf ? 4 : 2;
  const header = buffer.subarray(0, headerEnd).toString("ascii");
  const length = contentLengthFromHeader(header);
  if (length === null) return null;
  const bodyStart = headerEnd + separatorLength;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;
  return {
    payload: buffer.subarray(bodyStart, bodyEnd).toString("utf8"),
    rest: buffer.subarray(bodyEnd),
  };
}

export async function main(): Promise<void> {
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([
      buffer,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"),
    ]);
    while (buffer.length > 0) {
      const framed = framedMessage(buffer);
      if (framed) {
        outputMode = "framed";
        buffer = framed.rest;
        dispatchJson(framed.payload);
        continue;
      }

      const bufferText = buffer.toString("utf8");
      if (
        /^content-length:/i.test(bufferText) &&
        !bufferText.includes("\n\n")
      ) {
        return;
      }

      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = buffer.subarray(0, newlineIndex).toString("utf8").trim();
      buffer = buffer.subarray(newlineIndex + 1);
      if (!line) continue;
      outputMode = "jsonl";
      dispatchJson(line);
    }
  });
}
