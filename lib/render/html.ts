import { getRenderCss } from "./css.ts";
import { escapeHtml, renderItemCard, toSourceClass } from "./item.ts";
import { getItemMaskKeys } from "../item.ts";
import { normalizeMaskTabs, orderItemsByThread } from "../mask.ts";
import {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} from "./platform-icons.ts";
import type { FeedDocument, FeedItem, FeedTab } from "../types.ts";

interface PlatformFilter {
  source: string;
  sourceClass: string;
  meta: ReturnType<typeof getPlatformIconMeta>;
  icon: string;
}

function feedPlatforms(rows: FeedItem[]): PlatformFilter[] {
  return Array.from(
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
}

function selectItems(rows: FeedItem[], itemIds?: string[]): FeedItem[] {
  if (!Array.isArray(itemIds)) return rows;
  const idSet = new Set(itemIds.map((id) => String(id)));
  return rows.filter((row) =>
    getItemMaskKeys(row).some((key: string | number) => idSet.has(String(key))),
  );
}

function buildRows(rows: FeedItem[], selectedItems?: FeedItem[]): string {
  const items = Array.isArray(selectedItems) ? selectedItems : rows;
  return items
    .map((item: FeedItem, index: number) =>
      renderItemCard(item, index > 0 ? items[index - 1] : null),
    )
    .join("\n");
}

function buildGroups(rows: FeedItem[], tab: FeedTab): string {
  return tab.groups
    .map(
      (group) => `
    <section class="group-block">
      ${group.label ? `<div class="group-label">${escapeHtml(group.label)}</div>` : ""}
      ${buildRows(rows, selectItems(rows, group.item_ids))}
    </section>
  `,
    )
    .join("");
}

function defaultTabIndex(tabs: FeedTab[]): number {
  const firstNonAdsTabIndex = tabs.findIndex(
    (tab) =>
      String(tab.label || "")
        .trim()
        .toLowerCase() !== "ads",
  );
  return firstNonAdsTabIndex >= 0 ? firstNonAdsTabIndex : 0;
}

function groupedMarkup(rows: FeedItem[], tabs: FeedTab[]): string {
  if (tabs.length === 0) {
    return `<section class="feed">${buildRows(rows)}</section>`;
  }
  return `
    <section class="feed">
      ${tabs.map((tab) => buildGroups(rows, tab)).join("")}
    </section>
  `;
}

function tabMarkup(
  rows: FeedItem[],
  tabs: FeedTab[],
  platforms: PlatformFilter[],
): string {
  if (tabs.length === 0) return "";
  return `
    <div class="tab-shell">
      ${tabs.map((_tab, index: number) => `<input class="tab-toggle" type="checkbox" name="feed-tabs" id="feed-tab-${index}" ${index === defaultTabIndex(tabs) ? "checked" : ""} />`).join("")}
      ${platforms.map((_platform, index: number) => `<input class="platform-toggle" type="checkbox" name="feed-platforms" id="feed-platform-${index}" checked />`).join("")}
      <div class="tab-bar">
        <div class="tab-label-group">
          ${tabs.map((tab, index: number) => `<label class="tab-label" for="feed-tab-${index}">${escapeHtml(tab.label || `Tab ${index + 1}`)}</label>`).join("")}
        </div>
        ${platformFilterMarkup(platforms)}
      </div>
      <div class="tab-panels combined-panels">
        ${tabs
          .map(
            (tab, index: number) => `
        <section class="tab-panel tab-panel-${index}">
          ${tab.summary ? `<div class="tab-summary">${escapeHtml(tab.summary)}</div>` : ""}
          <div class="feed">${buildGroups(rows, tab)}</div>
        </section>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function platformFilterMarkup(platforms: PlatformFilter[]): string {
  if (platforms.length === 0) return "";
  return `<div class="platform-filter-group"><span class="filter-divider"></span>${platforms
    .map(
      (platform, index: number) =>
        `<label class="platform-filter-label" for="feed-platform-${index}" title="${escapeHtml(platform.meta.label)}"><img class="platform-filter-icon" src="${escapeHtml(platform.icon)}" alt="${escapeHtml(platform.meta.label)}" loading="lazy" /></label>`,
    )
    .join("")}</div>`;
}

function tabCss(tabbed: boolean, tabs: FeedTab[]): string {
  if (!tabbed) return "";
  return tabs
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
}

function platformCss(tabbed: boolean, platforms: PlatformFilter[]): string {
  if (!tabbed) return "";
  return platforms
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
}

const AUTOPLAY_SCRIPT = `
  (() => {
    const videos = Array.from(document.querySelectorAll("video.media-video"));
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

function renderDocument(document: FeedDocument): string {
  const rows: FeedItem[] = orderItemsByThread(document);
  const sourceLabel = String(document.source || "feed").toUpperCase();
  const tabs = normalizeMaskTabs(document.mask);
  const tabbed = document.mask?.tabbed === true || tabs.length > 0;
  const summary = document.mask?.summary || "";
  const selectedTabCount = tabs.length || 1;
  const platforms = feedPlatforms(rows);

  const feedTitle =
    sourceLabel === "COMBINED" ? "Your Feed" : `${sourceLabel} Feed`;
  const feedSubtitle =
    summary ||
    `${rows.length} curated posts across ${selectedTabCount} ${selectedTabCount === 1 ? "view" : "views"}.`;
  const sourceCountLabel = `${platforms.length} ${platforms.length === 1 ? "source" : "sources"}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${sourceLabel} Feed Mockup</title>
  <style>
  ${getRenderCss()}
  ${tabCss(tabbed, tabs)}
  ${platformCss(tabbed, platforms)}
  </style>
</head>
<body>
  <main class="app-shell">
    <header class="app-topbar">
      <div class="app-brand">
        <div class="app-kicker">Hand-Rolled Social</div>
        <h1>${escapeHtml(feedTitle)}</h1>
      </div>
      <div class="app-status">
        <span class="status-chip">${escapeHtml(String(rows.length))} posts</span>
        <span class="status-chip">${escapeHtml(sourceCountLabel)}</span>
      </div>
    </header>
    <section class="feed-briefing">
      <div class="briefing-label">For you</div>
      <p>${escapeHtml(feedSubtitle)}</p>
    </section>
    ${(tabbed && tabMarkup(rows, tabs, platforms)) || groupedMarkup(rows, tabs)}
  </main>
  <script>
  ${AUTOPLAY_SCRIPT}
  </script>
</body>
</html>`;
}

export { renderDocument };
