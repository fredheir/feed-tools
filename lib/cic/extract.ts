import { getSourceManifest, listSourceManifests } from "../source-manifest.ts";

export function getExtractionScript(sourceName: string, limit = 12): string {
  const manifest = getSourceManifest(sourceName);
  if (!manifest) {
    throw new Error(
      `No CiC extraction script for source "${sourceName}". ` +
        `Supported: ${listSourceManifests()
          .map((source) => source.name)
          .join(", ")}`,
    );
  }
  return manifest.cic.buildExtractionScript(limit);
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
    stableTicks?: number;
    timeoutMs?: number;
  } = {},
): string {
  const extractionScript = getExtractionScript(sourceName, limit);
  const safeFilename = filename.replace(/[\\/]+/g, "-") || "cic-capture.json";
  const minItems = options.minItems ?? 3;
  const stableTicks = options.stableTicks ?? 1;
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
        if ((count >= ${minItems} && stableTicks >= ${stableTicks}) || Date.now() - start > ${timeoutMs}) {
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
