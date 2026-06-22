import fs from "node:fs";
import path from "node:path";

import { getBrowserStatus } from "../browser-status.ts";
import { startBrowser } from "../browser-launch-service.ts";
import { type DoctorResult, runDoctor } from "../doctor-service.ts";
import { SOURCE_TARGETS, getSigninStatus } from "../signin-service.ts";
import { SUPPORTED_SOURCES } from "../source-catalog.ts";
import type { FeedSourceName } from "../types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_WORKDIR = path.resolve(
  process.env.FEED_TOOLS_WORKDIR || REPO_ROOT,
);
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_WORKDIR, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");
const DEFAULT_CHROME_PROFILE = path.join(DEFAULT_WORKDIR, "chrome-profile");
const DEFAULT_CHROME_LOG = path.join(DEFAULT_WORKDIR, "chrome.log");

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
type OutputMode = "jsonl" | "framed";

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
  const supported = new Set(SUPPORTED_SOURCES);
  return stringList(value).filter((source): source is FeedSourceName =>
    supported.has(source as FeedSourceName),
  );
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

function profileDir(args: JsonRecord): string {
  return path.resolve(
    stringValue(args.profile_dir) ||
      process.env.FEED_TOOLS_CHROME_PROFILE ||
      DEFAULT_CHROME_PROFILE,
  );
}

function browserStatusMcpResult(
  result: ReturnType<typeof getBrowserStatus>,
): JsonObject {
  return {
    ok: result.ok,
    cdp: result.cdp,
    version_url: result.versionUrl,
    browser: result.browser,
    web_socket_debugger_url_present: result.webSocketDebuggerUrlPresent,
    detail: result.detail,
  };
}

function browserStartMcpResult(
  result: Awaited<ReturnType<typeof startBrowser>>,
): JsonObject {
  return {
    ok: result.ok,
    cdp: result.cdp,
    profile_dir: result.profileDir,
    chrome_bin: result.chromeBin,
    log_path: result.logPath,
    launched: result.launched,
    pid: result.pid ?? null,
    version: result.version ?? null,
    detail: result.detail,
  };
}

function signinStatusMcpResult(
  result: ReturnType<typeof getSigninStatus>,
): JsonObject {
  return {
    profile_dir: result.profileDir,
    cookie_stores_found: result.cookieStoresFound,
    status: asJson(result.status),
    missing: asJson(result.missing),
  };
}

function enabledSourceNames(sources: unknown[]): string[] {
  const names: string[] = [];
  for (const source of sources) {
    if (!isRecord(source) || source.enabled === false) continue;
    const name = stringValue(source.name);
    if (name) names.push(name);
  }
  return names;
}

function mergePreferenceSection(
  userPreferences: JsonRecord,
  key: "render" | "curation" | "summary",
  value: unknown,
): boolean {
  if (!isRecord(value)) return false;
  const existing = isRecord(userPreferences[key]) ? userPreferences[key] : {};
  userPreferences[key] = asJson({ ...existing, ...value });
  return true;
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
  const preferenceSectionsWritten = [
    mergePreferenceSection(userPreferences, "render", args.render),
    mergePreferenceSection(userPreferences, "curation", args.curation),
    mergePreferenceSection(userPreferences, "summary", args.summary),
  ].filter(Boolean).length;

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
    sources_enabled: enabledSourceNames(sources),
    preference_sections_written: preferenceSectionsWritten,
    browser: asJson(browser || {}),
  };
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
  const message =
    error instanceof Error
      ? error.message
      : "Tool failed with a non-Error throw";
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${JSON.stringify(
          {
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

function doctorMcpResult(result: DoctorResult): JsonObject {
  return {
    ok: true,
    recommended_path: result.recommendedPath,
    checks: asJson(result.results),
    config: asJson(result.config),
    next_actions: asJson(result.nextActions),
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
        config_path: { type: "string" },
      },
    },
    handler: (args) =>
      doctorMcpResult(
        runDoctor({
          cdpPorts: Array.isArray(args.cdp_ports)
            ? args.cdp_ports.filter(
                (port): port is number => typeof port === "number",
              )
            : undefined,
          configure: booleanValue(args.write_config) === true,
          forceConfig: booleanValue(args.force_config) === true,
          configPath: configPath(args),
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
    handler: (args) =>
      browserStatusMcpResult(getBrowserStatus(stringValue(args.cdp))),
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
    handler: async (args) =>
      browserStartMcpResult(
        await startBrowser({
          cdpPort: numberValue(args.cdp_port),
          profileDir: profileDir(args),
          chromeBin: stringValue(args.chrome_bin),
          logPath: DEFAULT_CHROME_LOG,
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
    handler: async (args) => {
      const sources = sourceList(args.sources);
      if (sources.length === 0) throw new Error("Provide at least one source");
      const resolvedProfileDir = profileDir(args);
      const openedUrls = Object.fromEntries(
        sources.map((source) => [source, SOURCE_TARGETS[source].url]),
      );
      const browser = await startBrowser({
        cdpPort: numberValue(args.cdp_port),
        profileDir: resolvedProfileDir,
        logPath: DEFAULT_CHROME_LOG,
        urls: Object.values(openedUrls),
        reuseExisting: booleanValue(args.reuse_existing),
        noSandbox: booleanValue(args.no_sandbox),
      });
      const auth = getSigninStatus(sources, resolvedProfileDir);
      return {
        ok: true,
        cdp: browser.cdp,
        profile_dir: resolvedProfileDir,
        opened_urls: openedUrls,
        auth_status: asJson(auth.status),
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
      return signinStatusMcpResult(
        getSigninStatus(
          sources.length > 0 ? sources : [...SUPPORTED_SOURCES],
          profileDir(args),
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
        render: { type: "object" },
        curation: { type: "object" },
        summary: { type: "object" },
        overwrite: { type: "boolean" },
      },
    },
    handler: writeConfig,
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
      error instanceof Error
        ? error.message
        : "Non-Error thrown while handling MCP message",
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
        error instanceof Error
          ? error.message
          : "parser threw a non-Error value"
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

function isIncompleteFrame(buffer: Buffer<ArrayBufferLike>): boolean {
  const crlfHeaderEnd = buffer.indexOf("\r\n\r\n");
  const lfHeaderEnd = buffer.indexOf("\n\n");
  const hasCrlf = crlfHeaderEnd >= 0;
  const headerEnd = hasCrlf ? crlfHeaderEnd : lfHeaderEnd;
  if (headerEnd < 0) return /^content-length:/i.test(buffer.toString("ascii"));
  const separatorLength = hasCrlf ? 4 : 2;
  const header = buffer.subarray(0, headerEnd).toString("ascii");
  const length = contentLengthFromHeader(header);
  return (
    length !== null && buffer.length < headerEnd + separatorLength + length
  );
}

async function main(): Promise<void> {
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

      if (isIncompleteFrame(buffer)) return;

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

if (path.basename(process.argv[1] || "") === "feed-mcp") {
  await main();
}
