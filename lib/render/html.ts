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
import type {
  FeedDocument,
  FeedItem,
  FeedTab,
  FeedSourceName,
  RenderArtifactMeta,
} from "../types.js";

function renderDocument(
  document: FeedDocument,
  options: { devMeta?: RenderArtifactMeta | null } = {},
): string {
  const rows: FeedItem[] = orderItemsByThread(document);
  const sourceLabel = String(document.source || "feed").toUpperCase();
  const tabs = normalizeMaskTabs(document.mask);
  const tabbed = document.mask?.tabbed === true || tabs.length > 0;
  const summary = document.mask?.summary || "";
  const selectedTabCount = tabs.length || 1;
  const devMeta = options.devMeta || null;
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
  const feedTitle =
    sourceLabel === "COMBINED" ? "Your Feed" : `${sourceLabel} Feed`;
  const feedSubtitle =
    summary ||
    `${rows.length} curated posts across ${selectedTabCount} ${selectedTabCount === 1 ? "view" : "views"}.`;
  const firstNonAdsTabIndex = tabs.findIndex(
    (tab) =>
      String(tab.label || "")
        .trim()
        .toLowerCase() !== "ads",
  );
  const defaultTabIndex = firstNonAdsTabIndex >= 0 ? firstNonAdsTabIndex : 0;
  const sourceCountLabel = `${platforms.length} ${platforms.length === 1 ? "source" : "sources"}`;
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
      ${tabs.map((_tab, index: number) => `<input class="tab-toggle" type="checkbox" name="feed-tabs" id="feed-tab-${index}" ${index === defaultTabIndex ? "checked" : ""} />`).join("")}
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
  const devBanner = !devMeta
    ? ""
    : `
    <section class="dev-banner">
      <div class="dev-banner-label">Dev Artifact</div>
      <div class="dev-banner-grid">
        <span><strong>Generated:</strong> ${escapeHtml(devMeta.generated_at)}</span>
        <span><strong>Captured:</strong> ${escapeHtml(devMeta.captured_at || "unknown")}</span>
        <span><strong>Source:</strong> ${escapeHtml(devMeta.artifact_source_label || devMeta.input_path)}</span>
        <span><strong>Local media:</strong> ${escapeHtml(devMeta.local_media_count)}</span>
        <span><strong>Remote media:</strong> ${escapeHtml(devMeta.remote_media_count)}</span>
        <span><strong>Pending videos:</strong> ${escapeHtml(devMeta.pending_video_count)}</span>
      </div>
    </section>
  `;
  const refreshRail =
    !devMeta?.control_base_url || !Array.isArray(devMeta.refresh_sources)
      ? ""
      : `
    <aside class="refresh-rail" data-control-base-url="${escapeHtml(devMeta.control_base_url)}">
      <button class="refresh-button refresh-all" type="button" data-refresh-all="true">All</button>
      <div class="refresh-source-list">
        ${devMeta.refresh_sources
          .map((source: FeedSourceName) => {
            const meta = getPlatformIconMeta(source);
            const icon = getPlatformIconDataUri(source);
            return `<button class="refresh-button refresh-source" type="button" data-source="${escapeHtml(source)}" title="Refresh ${escapeHtml(meta.label)}"><img class="refresh-icon" src="${escapeHtml(icon)}" alt="${escapeHtml(meta.label)}" loading="lazy" /></button>`;
          })
          .join("")}
      </div>
      <div class="refresh-status-list"></div>
    </aside>
  `;
  const devScript =
    !devMeta?.control_base_url || !Array.isArray(devMeta.refresh_sources)
      ? ""
      : `
    (() => {
      const rail = document.querySelector(".refresh-rail");
      if (!rail) return;
      const baseUrl = rail.getAttribute("data-control-base-url");
      if (!baseUrl) return;
      const statusList = rail.querySelector(".refresh-status-list");
      const sourceButtons = Array.from(rail.querySelectorAll("[data-source]"));
      const allButton = rail.querySelector("[data-refresh-all]");

      async function post(path) {
        const response = await fetch(baseUrl + path, { method: "POST" });
        if (!response.ok) throw new Error("refresh request failed");
      }

      function renderStatus(payload) {
        const states = payload?.sources || [];
        if (statusList) {
          statusList.innerHTML = states
            .map((entry) => \`<div class="refresh-status refresh-status-\${entry.status || "idle"}"><span class="refresh-status-name">\${entry.label || entry.source}</span><span class="refresh-status-text">\${entry.message || entry.status || "idle"}</span></div>\`)
            .join("");
        }
        const busy = states.some((entry) =>
          ["queued", "capturing", "rendering", "downloading_video"].includes(entry.status),
        );
        for (const button of sourceButtons) {
          const source = button.getAttribute("data-source");
          const entry = states.find((state) => state.source === source);
          button.disabled = busy && (!entry || entry.status !== "error");
          button.classList.toggle("is-complete", entry?.status === "done");
          button.classList.toggle("is-busy", ["queued", "capturing", "rendering", "downloading_video"].includes(entry?.status || ""));
          button.classList.toggle("is-warning", entry?.status === "needs_classification");
        }
        if (allButton) {
          allButton.disabled = busy;
        }
      }

      async function refreshStatus() {
        const response = await fetch(baseUrl + "/api/status");
        if (!response.ok) return;
        renderStatus(await response.json());
      }

      for (const button of sourceButtons) {
        button.addEventListener("click", async () => {
          const source = button.getAttribute("data-source");
          if (!source) return;
          await post("/api/refresh/" + source);
          await refreshStatus();
        });
      }
      if (allButton) {
        allButton.addEventListener("click", async () => {
          await post("/api/refresh-all");
          await refreshStatus();
        });
      }
      refreshStatus();
      setInterval(refreshStatus, 1500);
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
    ${devBanner}
    ${tabMarkup || groupedMarkup}
  </main>
  ${refreshRail}
  <script>
  ${autoplayScript}
  ${devScript}
  </script>
</body>
</html>`;
}

module.exports = {
  renderDocument,
};
