import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { findCookieStores, hasCookieForDomains } from "../lib/signin-cli.js";

function createCookieStore(hosts: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-signin-"));
  const store = path.join(dir, "Cookies");
  const script = `
import sqlite3
import sys

store = sys.argv[1]
hosts = sys.argv[2:]
connection = sqlite3.connect(store)
connection.execute("create table cookies (host_key text)")
for host in hosts:
    connection.execute("insert into cookies (host_key) values (?)", (host,))
connection.commit()
connection.close()
`;
  execFileSync("python3", ["-c", script, store, ...hosts]);
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

  test("matches persisted cookies by exact or subdomain host", () => {
    const store = createCookieStore([".x.com", "accounts.google.com"]);

    expect(hasCookieForDomains([store], ["x.com"])).toBe(true);
    expect(hasCookieForDomains([store], ["google.com"])).toBe(true);
    expect(hasCookieForDomains([store], ["bsky.app"])).toBe(false);
  });
});
