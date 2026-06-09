import { getCdpVersionUrls, readCdpVersionPayload } from "./browser.ts";

export interface BrowserStatusResult {
  ok: boolean;
  cdp: string;
  versionUrl: string | null;
  browser: string | null;
  webSocketDebuggerUrlPresent: boolean;
  detail: string;
}

const DEFAULT_CDP = "9223";

export function getBrowserStatus(cdp?: string): BrowserStatusResult {
  const value =
    String(cdp || process.env.FEED_TOOLS_CDP || DEFAULT_CDP).trim() ||
    DEFAULT_CDP;
  const failures: string[] = [];
  const invalids: string[] = [];

  for (const url of getCdpVersionUrls(value)) {
    let output = "";
    try {
      output = readCdpVersionPayload(url);
    } catch {
      failures.push(url);
      continue;
    }

    try {
      const parsed = JSON.parse(output) as {
        Browser?: unknown;
        webSocketDebuggerUrl?: unknown;
      };
      const webSocketDebuggerUrlPresent =
        typeof parsed.webSocketDebuggerUrl === "string";
      if (webSocketDebuggerUrlPresent) {
        const browser =
          typeof parsed.Browser === "string"
            ? parsed.Browser
            : "Chrome DevTools Protocol endpoint";
        return {
          ok: true,
          cdp: value,
          versionUrl: url,
          browser,
          webSocketDebuggerUrlPresent,
          detail: `${browser} at ${url}`,
        };
      }
      invalids.push(`${url} did not include webSocketDebuggerUrl`);
    } catch {
      invalids.push(`${url} did not return JSON`);
    }
  }

  if (invalids.length > 0) {
    return {
      ok: false,
      cdp: value,
      versionUrl: getCdpVersionUrls(value)[0] || null,
      browser: null,
      webSocketDebuggerUrlPresent: false,
      detail: invalids.join("; "),
    };
  }

  return {
    ok: false,
    cdp: value,
    versionUrl: null,
    browser: null,
    webSocketDebuggerUrlPresent: false,
    detail: `${failures.join(", ")} are not usable CDP endpoints`,
  };
}
