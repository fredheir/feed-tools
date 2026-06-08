import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";
import {
  assertCdpEndpoint,
  buildAgentBrowserArgs,
  getCdpVersionUrl,
  getCdpVersionUrls,
  getRuntimeBrowserOptions,
  readCdpVersionPayload,
} from "../lib/browser.ts";
import { startBrowser } from "../lib/browser-launch-service.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("buildAgentBrowserArgs", () => {
  test("builds session-oriented browser args from config-style options", () => {
    const args = buildAgentBrowserArgs(
      {
        autoConnect: false,
        session: "feed-x",
        sessionName: "feed",
        statePath: "./.auth/x.json",
        profile: "./.profiles/x",
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        headed: true,
      },
      ["snapshot", "-i"],
    );

    expect(args).toEqual([
      "--session",
      "feed-x",
      "--session-name",
      "feed",
      "--profile",
      path.join(repoRoot, ".profiles/x"),
      "--state",
      path.join(repoRoot, ".auth/x.json"),
      "--headed",
      "--args",
      "--no-sandbox,--disable-dev-shm-usage",
      "snapshot",
      "-i",
    ]);
  });

  test("keeps auto-connect enabled by default for ad hoc browsing", () => {
    const args = buildAgentBrowserArgs({}, ["get", "url"]);
    expect(args).toEqual(["--auto-connect", "get", "url"]);
  });

  test("treats cdp as mutually exclusive with headed and auto-connect", () => {
    const args = buildAgentBrowserArgs(
      {
        cdp: "9222",
        headed: true,
        autoConnect: true,
      },
      ["snapshot", "-i"],
    );

    expect(args).toEqual(["--cdp", "9222", "snapshot", "-i"]);
  });

  test("strips startup-only options from runtime session reuse", () => {
    const runtime = getRuntimeBrowserOptions({
      autoConnect: false,
      session: "feed-x",
      statePath: "./.auth/x.json",
      profile: "./.profiles/x",
      args: ["--no-sandbox"],
      headed: true,
    });

    expect(runtime).toMatchObject({
      autoConnect: false,
      session: "feed-x",
      statePath: null,
      profile: null,
      args: [],
      headed: false,
    });
  });

  test("builds optional browser args from canonical config options", () => {
    const args = buildAgentBrowserArgs(
      {
        sessionName: "feed",
        statePath: "./.auth/x.json",
        allowFileAccess: true,
        colorScheme: "dark",
        executablePath: "/bin/chrome",
        args: ["--no-sandbox"],
      },
      ["snapshot"],
    );

    expect(args).toEqual([
      "--session-name",
      "feed",
      "--state",
      path.join(repoRoot, ".auth/x.json"),
      "--allow-file-access",
      "--color-scheme",
      "dark",
      "--executable-path",
      "/bin/chrome",
      "--auto-connect",
      "--args",
      "--no-sandbox",
      "snapshot",
    ]);
  });

  test("normalizes cdp config to disable headed and auto-connect", () => {
    const runtime = getRuntimeBrowserOptions({
      cdp: "9222",
      autoConnect: true,
      headed: true,
    });

    expect(runtime).toMatchObject({
      cdp: "9222",
      autoConnect: false,
      headed: false,
    });
  });

  test("builds CDP probe URLs from port and host forms", () => {
    expect(getCdpVersionUrl("9222")).toBe("http://127.0.0.1:9222/json/version");
    expect(getCdpVersionUrls("9222")).toEqual([
      "http://127.0.0.1:9222/json/version",
      "http://localhost:9222/json/version",
      "http://[::1]:9222/json/version",
    ]);
    expect(getCdpVersionUrl("127.0.0.1:9223")).toBe(
      "http://127.0.0.1:9223/json/version",
    );
    expect(getCdpVersionUrl("http://localhost:9224")).toBe(
      "http://localhost:9224/json/version",
    );
  });

  test("reads CDP version JSON through node runtime", async () => {
    const server = spawn(process.execPath, [
      "-e",
      `
import http from "node:http";
const server = http.createServer((_request, response) => {
  response.setHeader("content-type", "application/json");
  response.end('{"webSocketDebuggerUrl":"ws://127.0.0.1/devtools/browser"}');
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(String(server.address().port) + "\\n");
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`,
    ]);
    const port = await new Promise((resolve, reject) => {
      let payload = "";
      let stderr = "";
      server.stdout.on("data", (chunk) => {
        payload += String(chunk);
        const line = payload.split("\n")[0]?.trim();
        if (line) resolve(line);
      });
      server.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      server.once("error", reject);
      server.once("exit", (code) => {
        if (code)
          reject(new Error(`probe server exited with ${code}: ${stderr}`));
      });
    });
    try {
      const payload = readCdpVersionPayload(
        `http://127.0.0.1:${port}/json/version`,
      );
      expect(JSON.parse(payload)).toMatchObject({
        webSocketDebuggerUrl: "ws://127.0.0.1/devtools/browser",
      });
    } finally {
      server.kill("SIGTERM");
    }
  });

  test("keeps probing when one loopback host returns non-CDP content", async () => {
    const server = spawn(process.execPath, [
      "-e",
      `
import http from "node:http";
const nonCdpServer = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("not cdp");
});
nonCdpServer.listen(0, "127.0.0.1", () => {
  const port = nonCdpServer.address().port;
  const cdpServer = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://[::1]/devtools/browser" }));
  });
  cdpServer.on("error", () => process.exit(2));
  cdpServer.listen(port, "::1", () => process.stdout.write(String(port) + "\\n"));
  process.on("SIGTERM", () => {
    cdpServer.close(() => nonCdpServer.close(() => process.exit(0)));
  });
});
`,
    ]);
    const port = await new Promise((resolve, reject) => {
      let payload = "";
      let stderr = "";
      server.stdout.on("data", (chunk) => {
        payload += String(chunk);
        const line = payload.split("\n")[0]?.trim();
        if (line) resolve(line);
      });
      server.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      server.once("error", reject);
      server.once("exit", (code) => {
        if (code)
          reject(new Error(`probe server exited with ${code}: ${stderr}`));
      });
    });

    try {
      expect(assertCdpEndpoint(String(port))).toMatch(
        new RegExp(`^http://(localhost|\\[::1\\]):${port}$`),
      );
    } finally {
      server.kill("SIGTERM");
    }
  });

  test("rejects an occupied CDP port when reuse is disabled", async () => {
    const server = spawn(process.execPath, [
      "-e",
      `
import http from "node:http";
const server = http.createServer((_request, response) => {
  response.setHeader("content-type", "application/json");
  response.end('{"Browser":"Fixture Chrome","webSocketDebuggerUrl":"ws://127.0.0.1/devtools/browser"}');
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(String(server.address().port) + "\\n");
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`,
    ]);
    const port = await new Promise((resolve, reject) => {
      let payload = "";
      server.stdout.on("data", (chunk) => {
        payload += String(chunk);
        const line = payload.split("\n")[0]?.trim();
        if (line) resolve(Number(line));
      });
      server.once("error", reject);
      server.once("exit", (code) => {
        if (code) reject(new Error(`probe server exited with ${code}`));
      });
    });

    try {
      expect(() =>
        startBrowser({
          cdpPort: port,
          chromeBin: process.execPath,
          reuseExisting: false,
        }),
      ).toThrow(/already occupied/);
    } finally {
      server.kill("SIGTERM");
    }
  });
});
