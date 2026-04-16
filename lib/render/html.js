"use strict";

const { getRenderCss } = require("./css");
const { escapeHtml, renderItemCard, toSourceClass } = require("./item");
const { getItemMaskKeys } = require("../item");
const {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} = require("./platform-icons");

function orderThreadChains(items) {
  const rows = Array.isArray(items) ? items : [];
  const byUrl = new Map();
  const byId = new Map();
  const originalIndexById = new Map();
  const childToParent = new Map();

  for (const [index, item] of rows.entries()) {
    if (!item?.id) continue;
    byId.set(String(item.id), item);
    originalIndexById.set(String(item.id), index);
    if (item.url) byUrl.set(String(item.url), item);
  }

  for (const item of rows) {
    const parentId = String(item?.id || "");
    const childUrl = item?.thread?.child_candidate_url;
    if (!parentId || !childUrl) continue;
    const child = byUrl.get(String(childUrl));
    if (!child?.id || child.id === item.id) continue;
    childToParent.set(String(child.id), parentId);
  }

  function getChainRoot(item) {
    let currentId = String(item?.id || "");
    if (!currentId) return "";
    const seen = new Set();
    while (childToParent.has(currentId) && !seen.has(currentId)) {
      seen.add(currentId);
      currentId = childToParent.get(currentId);
    }
    return currentId;
  }

  const chainBuckets = new Map();
  for (const item of rows) {
    const id = String(item?.id || "");
    if (!id) continue;
    const rootId = getChainRoot(item) || id;
    const bucket = chainBuckets.get(rootId) || [];
    bucket.push(item);
    chainBuckets.set(rootId, bucket);
  }

  const orderedByRoot = new Map();
  for (const [rootId, bucket] of chainBuckets.entries()) {
    const childrenByParent = new Map();
    for (const item of bucket) {
      const id = String(item.id);
      const parentId = childToParent.get(id);
      if (!parentId) continue;
      const siblings = childrenByParent.get(parentId) || [];
      siblings.push(item);
      childrenByParent.set(parentId, siblings);
    }
    for (const siblings of childrenByParent.values()) {
      siblings.sort(
        (a, b) =>
          (originalIndexById.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) -
          (originalIndexById.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    const root = byId.get(rootId) || bucket[0];
    const ordered = [];
    const stack = [root];
    const seen = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      const currentId = String(current?.id || "");
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      ordered.push(current);
      const children = childrenByParent.get(currentId) || [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }

    for (const item of bucket) {
      const id = String(item.id);
      if (seen.has(id)) continue;
      ordered.push(item);
    }
    orderedByRoot.set(rootId, ordered);
  }

  const emittedRoots = new Set();
  const result = [];
  for (const item of rows) {
    const id = String(item?.id || "");
    if (!id) {
      result.push(item);
      continue;
    }
    const rootId = getChainRoot(item) || id;
    if (emittedRoots.has(rootId)) continue;
    emittedRoots.add(rootId);
    result.push(...(orderedByRoot.get(rootId) || [item]));
  }
  return result;
}

function renderDocument(document) {
  const rows = orderThreadChains(document.items);
  const sourceLabel = String(document.source || "feed").toUpperCase();
  const tabs = Array.isArray(document.mask?.tabs) ? document.mask.tabs : [];
  const tabbed = document.mask?.tabbed === true || tabs.length > 0;
  const summary = document.mask?.summary || "";
  const platforms = Array.from(
    new Map(
      rows.map((item) => {
        const source = String(item.source || "unknown");
        return [
          source,
          {
            source,
            sourceClass: toSourceClass(source),
            meta: getPlatformIconMeta(source),
            icon: getPlatformIconDataUri(source),
          },
        ];
      }),
    ).values(),
  );

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
  const groupedMarkup =
    tabs.length === 0
      ? `<section class="feed">${cards}</section>`
      : `
    <section class="feed">
      ${tabs.map((tab) => buildGroups(tab)).join("")}
    </section>
  `;
  const tabMarkup =
    !tabbed || tabs.length === 0
      ? ""
      : `
    <div class="tab-shell">
      ${tabs.map((tab, index) => `<input class="tab-toggle" type="checkbox" name="feed-tabs" id="feed-tab-${index}" ${String(tab.label || "").toLowerCase() === "ads" ? "" : "checked"} />`).join("")}
      ${platforms.map((platform, index) => `<input class="platform-toggle" type="checkbox" name="feed-platforms" id="feed-platform-${index}" checked />`).join("")}
      <div class="tab-bar">
        <div class="tab-label-group">
          ${tabs.map((tab, index) => `<label class="tab-label" for="feed-tab-${index}">${escapeHtml(tab.label || `Tab ${index + 1}`)}</label>`).join("")}
        </div>
        ${
          platforms.length > 0
            ? `<div class="platform-filter-group"><span class="filter-divider"></span>${platforms
                .map(
                  (platform, index) =>
                    `<label class="platform-filter-label" for="feed-platform-${index}" title="${escapeHtml(platform.meta.label)}"><img class="platform-filter-icon" src="${escapeHtml(platform.icon)}" alt="${escapeHtml(platform.meta.label)}" loading="lazy" /></label>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="tab-panels combined-panels">
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

  const tabCss = !tabbed
    ? ""
    : tabs
        .map(
          (tab, index) => `
    #feed-tab-${index}:checked ~ .tab-bar label[for="feed-tab-${index}"] {
      background: #fff;
      color: var(--text);
      box-shadow: 0 8px 24px rgba(19, 35, 52, 0.08);
    }
    #feed-tab-${index}:not(:checked) ~ .tab-bar label[for="feed-tab-${index}"] {
      opacity: 0.55;
    }
    #feed-tab-${index}:not(:checked) ~ .tab-panels .tab-panel-${index} {
      display: none;
    }`,
        )
        .join("\n");
  const platformCss = !tabbed
    ? ""
    : platforms
        .map(
          (platform, index) => `
    #feed-platform-${index}:not(:checked) ~ .tab-bar label[for="feed-platform-${index}"] {
      opacity: 0.45;
      filter: grayscale(1);
    }
    #feed-platform-${index}:not(:checked) ~ .tab-panels .${platform.sourceClass} {
      display: none;
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
  ${platformCss}
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <h2>Summary</h2>
      <p>${escapeHtml(summary || `Showing ${rows.length} curated items from ${sourceLabel}.`)}</p>
    </section>
    ${tabMarkup || groupedMarkup}
  </main>
</body>
</html>`;
}

module.exports = {
  renderDocument,
};
