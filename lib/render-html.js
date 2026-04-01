"use strict";

const { getRenderCss } = require("./render-css");
const { escapeHtml, renderItemCard } = require("./render-item");
const { getItemMaskKeys } = require("./item");

function renderDocument(document) {
  const rows = document.items;
  const sourceLabel = String(document.source || "feed").toUpperCase();
  const tabs = Array.isArray(document.mask?.tabs) ? document.mask.tabs : [];
  const summary = document.mask?.summary || "";

  function selectItems(itemIds) {
    if (!Array.isArray(itemIds)) return rows;
    const idSet = new Set(itemIds.map((id) => String(id)));
    return rows.filter((row) =>
      getItemMaskKeys(row).some((key) => idSet.has(String(key))),
    );
  }

  function buildRows(selectedItems) {
    const items = Array.isArray(selectedItems) ? selectedItems : rows;
    return items
      .map((item, index) =>
        renderItemCard(item, index > 0 ? items[index - 1] : null),
      )
      .join("\n");
  }

  function buildGroups(tab) {
    if (!Array.isArray(tab.groups) || tab.groups.length === 0) {
      return buildRows(selectItems(tab.item_ids));
    }
    return tab.groups
      .map(
        (group) => `
      <section class="group-block">
        ${group.label ? `<div class="group-label">${escapeHtml(group.label)}</div>` : ""}
        ${buildRows(selectItems(group.item_ids))}
      </section>
    `,
      )
      .join("");
  }

  const cards = buildRows(rows);
  const tabMarkup =
    tabs.length === 0
      ? ""
      : `
    <div class="tab-shell">
      ${tabs.map((tab, index) => `<input class="tab-toggle" type="radio" name="feed-tabs" id="feed-tab-${index}" ${index === 0 ? "checked" : ""} />`).join("")}
      <div class="tab-bar">
        ${tabs.map((tab, index) => `<label class="tab-label" for="feed-tab-${index}">${escapeHtml(tab.label || `Tab ${index + 1}`)}</label>`).join("")}
      </div>
      <div class="tab-panels">
        ${tabs
          .map(
            (tab, index) => `
        <section class="tab-panel tab-panel-${index}">
          ${tab.summary ? `<div class="tab-summary">${escapeHtml(tab.summary)}</div>` : ""}
          <div class="feed">${buildGroups(tab)}</div>
        </section>`,
          )
          .join("")}
      </div>
    </div>
  `;

  const tabCss = tabs
    .map(
      (tab, index) => `
    #feed-tab-${index}:checked ~ .tab-bar label[for="feed-tab-${index}"] {
      background: #fff;
      color: var(--text);
      box-shadow: 0 8px 24px rgba(19, 35, 52, 0.08);
    }
    #feed-tab-${index}:checked ~ .tab-panels .tab-panel-${index} {
      display: grid;
    }`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${sourceLabel} Feed Mockup</title>
  <style>
  ${getRenderCss()}
  ${tabCss}
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <h2>Summary</h2>
      <p>${escapeHtml(summary || `Showing ${rows.length} curated items from ${sourceLabel}.`)}</p>
    </section>
    ${tabMarkup || `<section class="feed">${cards}</section>`}
  </main>
</body>
</html>`;
}

module.exports = {
  renderDocument,
};
