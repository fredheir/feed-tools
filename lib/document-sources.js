"use strict";

function getDocumentSource(document) {
  const source = document?.source || null;
  return source === "combined" ? null : source;
}

function getDocumentSources(document) {
  const source = document?.source || null;
  if (source === "combined") {
    return Array.from(
      new Set(
        (document.items || []).map((item) => item?.source).filter(Boolean),
      ),
    );
  }
  return [source].filter(Boolean);
}

module.exports = {
  getDocumentSource,
  getDocumentSources,
};
