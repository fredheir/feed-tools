import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dirname, "..", "bin", "feed-capture-cic");
const CIC_SOURCES = [
  "x",
  "bluesky",
  "linkedin",
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
];

function run(args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
}

describe("feed-capture-cic prep", () => {
  test("returns valid JSON for x", () => {
    const output = JSON.parse(run(["prep", "x"]));
    expect(output.source).toBe("x");
    expect(output.url).toBe("https://x.com/home");
    expect(output.urlPrefixes).toContain("https://x.com/");
    expect(output.readyChecks).toBeInstanceOf(Array);
    expect(output.readyChecks.length).toBeGreaterThan(0);
    expect(output.scrollTopScript).toBeTruthy();
    expect(output.scrollDownScript).toBeTruthy();
    expect(output.itemCountExpression).toBeTruthy();
  });

  test("returns valid JSON for bluesky", () => {
    const output = JSON.parse(run(["prep", "bluesky"]));
    expect(output.source).toBe("bluesky");
    expect(output.url).toBe("https://bsky.app/");
    expect(output.urlPrefixes).toContain("https://bsky.app/");
  });

  test("returns valid JSON for linkedin", () => {
    const output = JSON.parse(run(["prep", "linkedin"]));
    expect(output.source).toBe("linkedin");
    expect(output.url).toContain("linkedin.com");
  });

  test.each(CIC_SOURCES)("returns valid JSON for %s", (source) => {
    const output = JSON.parse(run(["prep", source]));
    expect(output.source).toBe(source);
    expect(output.url).toMatch(/^https:\/\//);
    expect(output.urlPrefixes).toBeInstanceOf(Array);
    expect(output.readyChecks.length).toBeGreaterThan(0);
    expect(output.scrollTopScript).toBeTruthy();
    expect(output.scrollDownScript).toBeTruthy();
    expect(output.itemCountExpression).toBeTruthy();
  });

  test("rejects unknown source", () => {
    expect(() => run(["prep", "nonexistent"])).toThrow();
  });

  test("rejects prototype-chain keys", () => {
    expect(() => run(["prep", "toString"])).toThrow();
  });
});

describe("feed-capture-cic extract", () => {
  test("outputs a JavaScript IIFE for x", () => {
    const script = run(["extract", "x", "10"]);
    expect(script).toContain("(() => {");
    expect(script).toContain("const limit = 10");
    expect(script).toContain('source: "x"');
    expect(script).toContain("article");
  });

  test("outputs a JavaScript IIFE for bluesky", () => {
    const script = run(["extract", "bluesky", "5"]);
    expect(script).toContain("(() => {");
    expect(script).toContain("const limit = 5");
    expect(script).toContain('source: "bluesky"');
    expect(script).toContain("feedItem-by-");
  });

  test("outputs a JavaScript IIFE for linkedin", () => {
    const script = run(["extract", "linkedin"]);
    expect(script).toContain("(() => {");
    expect(script).toContain('source: "linkedin"');
  });

  test.each(CIC_SOURCES)("outputs parseable JavaScript for %s", (source) => {
    const script = run(["extract", source, "4"]);
    expect(script).toContain("(() => {");
    expect(script).toContain("const limit = 4");
    expect(script).toContain(`source: "${source}"`);
    expect(() => new Function(script)).not.toThrow();
  });

  test("defaults limit to 12", () => {
    const script = run(["extract", "x"]);
    expect(script).toContain("const limit = 12");
  });

  test("can wrap extraction as a browser download", () => {
    const script = run(["extract", "x", "7", "--download"]);
    expect(script).toContain("new Promise");
    expect(script).toContain("new Blob([json]");
    expect(script).toContain('link.download = "cic-capture-x.json"');
    expect(script).toContain("const limit = 7");
    expect(script).toContain('source: "x"');
    expect(script).not.toContain("scheduled");
    expect(() => new Function(script)).not.toThrow();
  });

  test("sanitizes custom download filenames", () => {
    const script = run([
      "extract",
      "x",
      "--download",
      "../nested/capture.json",
    ]);
    expect(script).toContain('link.download = "..-nested-capture.json"');
    expect(script).not.toContain("../nested/capture.json");
  });

  test("rejects prototype-chain keys", () => {
    expect(() => run(["extract", "toString"])).toThrow();
  });
});

describe("feed-capture-cic ingest", () => {
  test("ingests a minimal document and outputs merged JSON", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cic-test-"));
    const jsonFile = join(tmp, "capture.json");
    const saveDir = join(tmp, "save");
    const configPath = join(tmp, "config.json");

    writeFileSync(
      jsonFile,
      JSON.stringify({
        schema_version: 1,
        source: "x",
        captured_at: new Date().toISOString(),
        items: [
          {
            source: "x",
            source_item_id: "123456789",
            index: 1,
            url: "https://x.com/user/status/123456789",
            author: {
              handle: "@testuser",
              display_name: "Test User",
              profile_image_url: null,
            },
            content: { text: "Hello from CiC test" },
            stats: { reply: null, share: null, like: "5", view: "100" },
            media: [],
            cards: [],
            thread: {
              has_thread_line: false,
              thread_line_height: null,
              thread_line_x: null,
            },
            embedded_links: [],
          },
        ],
      }),
    );
    rmSync(configPath, { force: true });

    const output = run(["ingest", "x", jsonFile, "--save-dir", saveDir]);
    const merged = JSON.parse(output);

    expect(merged.schema_version).toBe(1);
    expect(merged.source).toBe("x");
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].content.text).toBe("Hello from CiC test");
    expect(merged.items[0].capture_count).toBe(1);
  });

  test("rejects missing json file", () => {
    expect(() => run(["ingest", "x", "/nonexistent.json"])).toThrow();
  });

  test("rejects unknown source before ingest", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cic-test-"));
    const jsonFile = join(tmp, "capture.json");

    writeFileSync(
      jsonFile,
      JSON.stringify({
        schema_version: 1,
        source: "x",
        captured_at: new Date().toISOString(),
        items: [],
      }),
    );

    expect(() => run(["ingest", "xs", jsonFile])).toThrow();
    expect(() => run(["ingest", "toString", jsonFile])).toThrow();
  });

  test("rejects unknown ingest flags", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cic-test-"));
    const jsonFile = join(tmp, "capture.json");

    writeFileSync(
      jsonFile,
      JSON.stringify({
        schema_version: 1,
        source: "x",
        captured_at: new Date().toISOString(),
        items: [],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [CLI, "ingest", "x", jsonFile, "--unexpected-flag"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --unexpected-flag");
    expect(result.stderr).not.toContain("at ");
    expect(result.stderr).not.toContain("Node.js v");
  });

  test("rejects missing values for ingest flags", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cic-test-"));
    const jsonFile = join(tmp, "capture.json");

    writeFileSync(
      jsonFile,
      JSON.stringify({
        schema_version: 1,
        source: "x",
        captured_at: new Date().toISOString(),
        items: [],
      }),
    );

    expect(() =>
      run(["ingest", "x", jsonFile, "--save-dir", "--assets-dir", tmp]),
    ).toThrow();
  });
});

describe("extraction scripts are self-contained", () => {
  test("x extraction script parses without syntax errors", () => {
    const script = run(["extract", "x", "3"]);
    // Wrapping in Function() validates the syntax without executing.
    expect(() => new Function(script)).not.toThrow();
  });

  test("bluesky extraction script parses without syntax errors", () => {
    const script = run(["extract", "bluesky", "3"]);
    expect(() => new Function(script)).not.toThrow();
  });

  test("linkedin extraction script parses without syntax errors", () => {
    const script = run(["extract", "linkedin", "3"]);
    expect(() => new Function(script)).not.toThrow();
  });
});
