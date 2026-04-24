import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { findCookieStores, hasAuthCookie } from "../lib/signin-cli.js";

function createCookieStore(
  cookies: Array<{ host: string; name: string }>,
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-signin-"));
  const store = path.join(dir, "Cookies");
  const script = `
import sqlite3
import sys
import json

store = sys.argv[1]
cookies = json.loads(sys.argv[2])
connection = sqlite3.connect(store)
connection.execute("create table cookies (host_key text, name text)")
for cookie in cookies:
    connection.execute("insert into cookies (host_key, name) values (?, ?)", (cookie["host"], cookie["name"]))
connection.commit()
connection.close()
`;
  execFileSync("python3", ["-c", script, store, JSON.stringify(cookies)]);
  return store;
}

describe("feed-signin helpers", () => {
  test("finds cookie stores under the Chrome profile", () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "feed-profile-"));
    const store = path.join(profile, "Default", "Network", "Cookies");
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fs.writeFileSync(store, "");

    expect(findCookieStores(profile)).toEqual([store]);
  });

  test("requires an authenticated cookie name on an expected domain", () => {
    const store = createCookieStore([
      { host: ".x.com", name: "guest_id" },
      { host: "accounts.google.com", name: "SID" },
    ]);

    expect(
      hasAuthCookie([store], [{ domains: ["x.com"], names: ["auth_token"] }]),
    ).toBe(false);
    expect(
      hasAuthCookie([store], [{ domains: ["google.com"], names: ["SID"] }]),
    ).toBe(true);
    expect(
      hasAuthCookie([store], [{ domains: ["bsky.app"], names: ["SID"] }]),
    ).toBe(false);
  });
});
