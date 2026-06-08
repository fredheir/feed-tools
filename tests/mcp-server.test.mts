import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { framedMessage, listMcpTools } from "../lib/mcp/server.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function callMcpTool(
  name: string,
  args: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = {},
): Record<string, unknown> {
  const input = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  })}\n`;

  const result = spawnSync(process.execPath, ["./bin/feed-mcp"], {
    cwd: REPO_ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

  expect(result.status, result.stderr).toBe(0);
  const response = JSON.parse(result.stdout.trim());
  return JSON.parse(response.result.content[0].text);
}

describe("feed-tools MCP server", () => {
  test("registers setup, status, and pipeline tools", () => {
    expect(listMcpTools().map((tool) => tool.name)).toEqual([
      "feed_doctor",
      "feed_browser_status",
      "feed_browser_start",
      "feed_signin_open",
      "feed_signin_status",
      "feed_config_read",
      "feed_config_write",
      "feed_capture",
      "feed_curate",
      "feed_classify",
      "feed_render",
      "feed_open",
      "feed_pipeline",
      "feed_pipeline_render",
    ]);
  });

  test("all registered tools expose object schemas", () => {
    for (const tool of listMcpTools()) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });

  test("parses framed MCP messages by byte length", () => {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "feed_config_write", arguments: { note: "é 🚀" } },
    });
    const nextPayload = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });
    const input = Buffer.concat([
      Buffer.from(
        `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`,
        "utf8",
      ),
      Buffer.from(
        `Content-Length: ${Buffer.byteLength(nextPayload, "utf8")}\r\n\r\n${nextPayload}`,
        "utf8",
      ),
    ]);

    const first = framedMessage(input);

    expect(first?.payload).toBe(payload);
    expect(framedMessage(first?.rest ?? Buffer.alloc(0))?.payload).toBe(
      nextPayload,
    );
  });

  test("feed_doctor returns documented MCP field names", () => {
    const payload = callMcpTool("feed_doctor", {
      write_config: false,
      cdp_ports: [],
    });

    expect(payload).toMatchObject({
      ok: true,
      recommended_path: expect.any(String),
      checks: expect.any(Array),
      config: expect.any(Object),
      next_actions: expect.any(Array),
    });
    expect(payload).not.toHaveProperty("recommendedPath");
    expect(payload).not.toHaveProperty("results");
    expect(payload).not.toHaveProperty("nextActions");
  });

  test("uses FEED_TOOLS_WORKDIR for default config path", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-mcp-workdir-"));

    const payload = callMcpTool(
      "feed_config_read",
      {},
      {
        FEED_TOOLS_WORKDIR: workdir,
        FEED_TOOLS_CONFIG: "",
      },
    );

    expect(payload).toMatchObject({
      ok: true,
      exists: false,
      path: path.join(workdir, "config.json"),
    });
  });

  test("feed_config_write accepts preference sections", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-mcp-config-"));
    const configPath = path.join(workdir, "config.json");

    const payload = callMcpTool(
      "feed_config_write",
      {
        overwrite: true,
        render: { show_tabs: false },
        curation: { target_items_per_tab: 4 },
        summary: { custom_instructions: "Prefer short bullets." },
      },
      {
        FEED_TOOLS_WORKDIR: workdir,
        FEED_TOOLS_CONFIG: "",
      },
    );

    expect(payload).toMatchObject({
      ok: true,
      written: true,
      preference_sections_written: 3,
    });
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toMatchObject({
      user_preferences: {
        render: { show_tabs: false },
        curation: { target_items_per_tab: 4 },
        summary: { custom_instructions: "Prefer short bullets." },
      },
    });
  });

  test("feed_doctor writes config under FEED_TOOLS_WORKDIR", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-mcp-doctor-"));
    const configPath = path.join(workdir, "config.json");
    fs.writeFileSync(
      path.join(workdir, "config.json.example"),
      `${JSON.stringify({ user_preferences: { sources: [{ name: "x" }] } })}\n`,
    );

    const payload = callMcpTool(
      "feed_doctor",
      { write_config: true, force_config: true, cdp_ports: [] },
      {
        FEED_TOOLS_WORKDIR: workdir,
        FEED_TOOLS_CONFIG: "",
      },
    );

    expect(payload.config).toMatchObject({
      status: "created",
      path: configPath,
    });
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test("status tools return documented snake_case fields", () => {
    const browserStatus = callMcpTool("feed_browser_status", { cdp: "1" });
    expect(browserStatus).toMatchObject({
      ok: false,
      cdp: "1",
      version_url: null,
      web_socket_debugger_url_present: false,
      detail: expect.any(String),
    });
    expect(browserStatus).not.toHaveProperty("versionUrl");
    expect(browserStatus).not.toHaveProperty("webSocketDebuggerUrlPresent");

    const signinStatus = callMcpTool("feed_signin_status", { sources: ["x"] });
    expect(signinStatus).toMatchObject({
      profile_dir: expect.any(String),
      cookie_stores_found: expect.any(Number),
      status: expect.any(Object),
      missing: expect.any(Array),
    });
    expect(signinStatus).not.toHaveProperty("profileDir");
    expect(signinStatus).not.toHaveProperty("cookieStoresFound");
  });
});
