"use strict";

function textOf(node) {
  return (node?.innerText || node?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function multilineTextOf(node) {
  return (node?.innerText || node?.textContent || "")
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function linesOf(node) {
  return multilineTextOf(node)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeCount(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function makeAbsoluteUrl(url, base) {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function toBrowserFunctionSource(fn) {
  return `${fn.toString()}\n`;
}

function buildBrowserRuntimeScript(limit, body, extras = []) {
  const prelude = [
    textOf,
    multilineTextOf,
    linesOf,
    normalizeCount,
    makeAbsoluteUrl,
    ...extras,
  ]
    .map(toBrowserFunctionSource)
    .join("");
  return `(() => {
    const limit = ${JSON.stringify(limit)};
    ${prelude}
    ${body}
  })()`;
}

module.exports = {
  buildBrowserRuntimeScript,
  normalizeCount,
  makeAbsoluteUrl,
};
