import { describe, expect, test } from "vitest";

import { listMcpTools } from "../lib/mcp/server.ts";

describe("feed-tools MCP server", () => {
  test("registers setup and status tools", () => {
    expect(listMcpTools().map((tool) => tool.name)).toEqual([
      "feed_doctor",
      "feed_browser_status",
      "feed_browser_start",
      "feed_signin_open",
      "feed_signin_status",
      "feed_config_read",
      "feed_config_write",
    ]);
  });

  test("all registered tools expose object schemas", () => {
    for (const tool of listMcpTools()) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });
});
