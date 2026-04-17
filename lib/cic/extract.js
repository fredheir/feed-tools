"use strict";

/**
 * CiC extraction-script registry for the supported browser sources.
 */

const {
  buildExtractionScript: buildXScript,
} = require("../../sources/x/capture");
const {
  buildExtractionScript: buildBlueskyScript,
} = require("../../sources/bluesky/capture");
const {
  buildExtractionScript: buildLinkedInScript,
} = require("../../sources/linkedin/capture");

const EXTRACTION_SCRIPTS = {
  x: buildXScript,
  bluesky: buildBlueskyScript,
  linkedin: buildLinkedInScript,
};

const hasOwnExtractionScript = (sourceName) =>
  Object.prototype.hasOwnProperty.call(EXTRACTION_SCRIPTS, sourceName);

function getExtractionScript(sourceName, limit = 12) {
  if (!hasOwnExtractionScript(sourceName)) {
    throw new Error(
      `No CiC extraction script for source "${sourceName}". ` +
        `Supported: ${Object.keys(EXTRACTION_SCRIPTS).join(", ")}`,
    );
  }
  const builder = EXTRACTION_SCRIPTS[sourceName];
  return builder(limit);
}

module.exports = { getExtractionScript };
