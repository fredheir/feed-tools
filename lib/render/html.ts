"use strict";

const { getRenderCss } = require("./css.js");
const { escapeHtml, renderItemCard, toSourceClass } = require("./item.js");
const { getItemMaskKeys } = require("../item.js");
const { normalizeMaskTabs, orderItemsByThread } = require("../mask.js") as {
  normalizeMaskTabs: (mask: FeedDocument["mask"]) => FeedTab[];
  orderItemsByThread: (document: FeedDocument) => FeedItem[];
};
const {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} = require("./platform-icons.js");
import type { FeedDocument, FeedItem, FeedTab } from "../types.js";

function renderDocument(document: FeedDocument): string {
  const rows: FeedItem[] = orderItemsByThread(document);
  const sourceLabel = String(document.source || "feed").toUpperCase();
  const tabs = normalizeMaskTabs(document.mask);
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

  function selectItems(itemIds?: string[]): FeedItem[] {
    if (!Array.isArray(itemIds)) return rows;
    const idSet = new Set(itemIds.map((id) => String(id)));
    return rows.filter((row) =>
      getItemMaskKeys(row).some((key: string | number) =>
        idSet.has(String(key)),
      ),
    );
  }

  function buildRows(selectedItems?: FeedItem[]): string {
    const items = Array.isArray(selectedItems) ? selectedItems : rows;
    return items
      .map((item: FeedItem, index: number) =>
        renderItemCard(item, index > 0 ? items[index - 1] : null),
      )
      .join("\n");
  }

  function buildGroups(tab: FeedTab): string {
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
      ${tabs.map((tab, index: number) => `<input class="tab-toggle" type="checkbox" name="feed-tabs" id="feed-tab-${index}" ${String(tab.label || "").toLowerCase() === "ads" ? "" : "checked"} />`).join("")}
      ${platforms.map((platform, index: number) => `<input class="platform-toggle" type="checkbox" name="feed-platforms" id="feed-platform-${index}" checked />`).join("")}
      <div class="tab-bar">
        <div class="tab-label-group">
          ${tabs.map((tab, index: number) => `<label class="tab-label" for="feed-tab-${index}">${escapeHtml(tab.label || `Tab ${index + 1}`)}</label>`).join("")}
        </div>
        ${
          platforms.length > 0
            ? `<div class="platform-filter-group"><span class="filter-divider"></span>${platforms
                .map(
                  (platform, index: number) =>
                    `<label class="platform-filter-label" for="feed-platform-${index}" title="${escapeHtml(platform.meta.label)}"><img class="platform-filter-icon" src="${escapeHtml(platform.icon)}" alt="${escapeHtml(platform.meta.label)}" loading="lazy" /></label>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="tab-panels combined-panels">
        ${tabs
          .map(
            (tab, index: number) => `
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
          (_tab, index: number) => `
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
          (platform, index: number) => `
    #feed-platform-${index}:not(:checked) ~ .tab-bar label[for="feed-platform-${index}"] {
      opacity: 0.45;
      filter: grayscale(1);
    }
    #feed-platform-${index}:not(:checked) ~ .tab-panels .${platform.sourceClass} {
      display: none;
    }`,
        )
        .join("\n");
  const autoplayScript = `
    (() => {
      const videos = Array.from(document.querySelectorAll(".media-video"));
      if (videos.length === 0) return;

      for (const video of videos) {
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.loop = true;

        const applyOrientation = () => {
          const ratio = video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : 0;
          const container = video.closest(".media-player");
          if (!container) return;
          container.classList.toggle("landscape", ratio > 1);
        };
        video.addEventListener("loadedmetadata", applyOrientation, {
          once: true,
        });
        if (video.readyState >= 1) applyOrientation();
      }

      let activeVideo = null;
      const visibility = new Map();

      function setActive(video) {
        if (!video || activeVideo === video) return;
        if (activeVideo) activeVideo.pause();
        activeVideo = video;
        const playResult = video.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {});
        }
      }

      function refreshPlayback() {
        const candidates = Array.from(visibility.entries())
          .filter(([, ratio]) => ratio > 0.45)
          .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            const aTop = Math.abs(a[0].getBoundingClientRect().top);
            const bTop = Math.abs(b[0].getBoundingClientRect().top);
            return aTop - bTop;
          });
        if (candidates.length > 0) {
          setActive(candidates[0][0]);
          return;
        }
        if (activeVideo) {
          activeVideo.pause();
          activeVideo = null;
        }
      }

      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          visibility.set(entry.target, entry.intersectionRatio);
        }
        refreshPlayback();
      }, {
        threshold: [0, 0.25, 0.45, 0.6, 0.8],
      });

      for (const video of videos) observer.observe(video);

      requestAnimationFrame(() => {
        const firstVisible = videos.find((video) => {
          const rect = video.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        }) || videos[0];
        setActive(firstVisible);
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && activeVideo) activeVideo.pause();
        if (!document.hidden) refreshPlayback();
      });
    })();
  `;

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
  <script>
  ${autoplayScript}
  </script>
</body>
</html>`;
}

module.exports = {
  renderDocument,
};
