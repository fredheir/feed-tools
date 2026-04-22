const {
  buildExtractionScript: buildBlueskyScript,
} = require("../../sources/bluesky/capture.js");
const {
  buildExtractionScript: buildLinkedInScript,
} = require("../../sources/linkedin/capture.js");
const {
  buildExtractionScript: buildXScript,
} = require("../../sources/x/capture.js");

const EXTRACTION_SCRIPTS = {
  x: buildXScript,
  bluesky: buildBlueskyScript,
  linkedin: buildLinkedInScript,
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

export function isCicSupported(
  sourceName: string,
): sourceName is CicSourceName {
  return hasOwnExtractionScript(sourceName);
}
