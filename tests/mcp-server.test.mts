import { describe, expect, test } from "vitest";

import { framedMessage, listMcpTools } from "../lib/mcp/server.ts";

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
});
