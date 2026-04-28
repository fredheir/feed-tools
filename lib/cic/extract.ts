import { buildExtractionScript as buildBlueskyScript } from "../../sources/bluesky/capture.ts";
import { buildExtractionScript as buildFacebookScript } from "../../sources/facebook/capture.ts";
import { buildExtractionScript as buildInstagramScript } from "../../sources/instagram/capture.ts";
import { buildExtractionScript as buildLinkedInScript } from "../../sources/linkedin/capture.ts";
import { buildExtractionScript as buildTikTokScript } from "../../sources/tiktok/capture.ts";
import { buildExtractionScript as buildXScript } from "../../sources/x/capture.ts";
import { buildExtractionScript as buildYouTubeScript } from "../../sources/youtube/capture.ts";

const EXTRACTION_SCRIPTS = {
  x: buildXScript,
  bluesky: buildBlueskyScript,
  linkedin: buildLinkedInScript,
  instagram: buildInstagramScript,
  tiktok: buildTikTokScript,
  youtube: buildYouTubeScript,
  facebook: buildFacebookScript,
};

type CicSourceName = keyof typeof EXTRACTION_SCRIPTS;

const hasOwnExtractionScript = (
  sourceName: string,
): sourceName is CicSourceName =>
  Object.prototype.hasOwnProperty.call(EXTRACTION_SCRIPTS, sourceName);

export function getExtractionScript(sourceName: string, limit = 12): string {
  if (!hasOwnExtractionScript(sourceName)) {
    throw new Error(
      `No CiC extraction script for source "${sourceName}". ` +
        `Supported: ${Object.keys(EXTRACTION_SCRIPTS).join(", ")}`,
    );
  }
  const builder = EXTRACTION_SCRIPTS[sourceName];
  return builder(limit);
}

/**
 * Build the JS to extract from <source> and trigger a browser download
 * of the resulting JSON.  When `itemCountExpression` is provided the
 * script polls until that selector returns at least `minItems` and is stable
 * across two ticks (or `timeoutMs` elapses) before firing. This avoids wasting
 * Chrome's one-download-per-nav slot on a half-rendered page. Designed for the
 * recommended per-source `browser_batch` flow (see AGENTS.md).
 */
export function buildDownloadExtractionScript(
  sourceName: string,
  limit = 12,
  filename = `cic-capture-${sourceName}.json`,
  options: {
    itemCountExpression?: string;
    minItems?: number;
    timeoutMs?: number;
  } = {},
): string {
  const extractionScript = getExtractionScript(sourceName, limit);
  const safeFilename = filename.replace(/[\\/]+/g, "-") || "cic-capture.json";
  const minItems = options.minItems ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  const itemCountExpr = options.itemCountExpression ?? "1";
  return `(() => new Promise((resolve, reject) => {
    const start = Date.now();
    let fired = false;
    let previousCount = -1;
    let stableTicks = 0;
    function fire() {
      if (fired) return;
      try {
        const json = (${extractionScript});
        fired = true;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = ${JSON.stringify(safeFilename)};
        link.rel = "noopener";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        window.__CIC_LAST__ = { ok: true, source: ${JSON.stringify(sourceName)}, bytes: json.length, filename: ${JSON.stringify(safeFilename)} };
        resolve(JSON.stringify(window.__CIC_LAST__));
      } catch (error) {
        fired = true;
        window.__CIC_LAST__ = { ok: false, source: ${JSON.stringify(sourceName)}, error: String(error?.message || error) };
        reject(error);
      }
    }
    function tick() {
      try {
        const count = Number(${itemCountExpr}) || 0;
        stableTicks = count === previousCount ? stableTicks + 1 : 0;
        previousCount = count;
        if ((count >= ${minItems} && stableTicks >= 1) || Date.now() - start > ${timeoutMs}) {
          fire();
          return;
        }
      } catch {
        /* selector not ready yet */
      }
      setTimeout(tick, 200);
    }
    tick();
  }))()`;
}

export function isCicSupported(
  sourceName: string,
): sourceName is CicSourceName {
  return hasOwnExtractionScript(sourceName);
}
