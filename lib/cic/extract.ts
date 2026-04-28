import { buildExtractionScript as buildBlueskyScript } from "../../sources/bluesky/capture.ts";
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

export function buildDownloadExtractionScript(
  sourceName: string,
  limit = 12,
  filename = `cic-capture-${sourceName}.json`,
): string {
  const extractionScript = getExtractionScript(sourceName, limit);
  const safeFilename = filename.replace(/[\\/]+/g, "-") || "cic-capture.json";
  return `(() => {
    const json = (${extractionScript});
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
    return JSON.stringify({
      ok: true,
      transport: "download",
      filename: ${JSON.stringify(safeFilename)},
      bytes: json.length
    });
  })()`;
}

export function isCicSupported(
  sourceName: string,
): sourceName is CicSourceName {
  return hasOwnExtractionScript(sourceName);
}
