import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { framedMessage, listMcpTools } from "../lib/mcp/server.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

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
    const input = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "feed_doctor",
        arguments: { write_config: false, cdp_ports: [] },
      },
    })}\n`;

    const result = spawnSync(process.execPath, ["./bin/feed-mcp"], {
      cwd: REPO_ROOT,
      input,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const response = JSON.parse(result.stdout.trim());
    const payload = JSON.parse(response.result.content[0].text);
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
});
