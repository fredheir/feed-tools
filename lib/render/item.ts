"use strict";

const { getItemMaskKeys } = require("../item.js");
const {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} = require("./platform-icons.js");
import type {
  FeedCard,
  FeedItem,
  FeedMedia,
  FeedStatValue,
  FeedStats,
} from "../types.js";

const ACTIONS: ReadonlyArray<{
  key: keyof FeedStats;
  icon: string;
  label: string;
}> = [
  { key: "reply", icon: "↩", label: "Reply" },
  { key: "share", icon: "⟲", label: "Repost" },
  { key: "like", icon: "♡", label: "Like" },
  { key: "view", icon: "▥", label: "Views" },
];

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAction(
  icon: string,
  label: string,
  value: FeedStatValue,
  extraClass = "",
): string {
  const className = extraClass ? `action-pill ${extraClass}` : "action-pill";
  return `<span class="${className}"><span class="action-icon" aria-hidden="true">${icon}</span><span class="action-label">${escapeHtml(label)}</span><span class="action-value">${escapeHtml(value ?? "0")}</span></span>`;
}

function isProfileishImage(value: string | null | undefined): boolean {
  return (
    !!value &&
    (/profile_images/.test(value) ||
      /_mini\./.test(value) ||
      /_normal\./.test(value))
  );
}

function toSourceClass(source: string | null | undefined): string {
  return `source-${String(source || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
}

function inferVideoType(value: string | null | undefined): string {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes(".webm")) return "video/webm";
  if (normalized.includes(".mov")) return "video/quicktime";
  return "video/mp4";
}

function compactUrl(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function formatHandle(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value.startsWith("@") ? value : `@${value}`;
}

function getAuthorName(item: FeedItem): string {
  if (item.author?.display_name) return item.author.display_name;
  if (item.author?.handle) return formatHandle(item.author.handle);
  return "Unknown";
}

function getAuthorSecondary(item: FeedItem): string | null {
  const handle = item.author?.handle || null;
  const displayName = item.author?.display_name || null;
  if (!handle) return null;
  return displayName && displayName !== handle ? formatHandle(handle) : null;
}

function renderMedia(items: FeedMedia[], sourceName = ""): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item: FeedMedia) => {
      const platformLabel = getPlatformIconMeta(
        sourceName || item.source || "",
      ).label;
      const videoSource = item.local_video_src || item.video_src || null;
      if (videoSource) {
        const poster = item.local_src || item.src || "";
        const openLink = item.href
          ? `<a class="media-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">Open on ${escapeHtml(platformLabel)}</a>`
          : "";
        return `
          <div class="media-player">
            <video class="media-video" controls preload="metadata"${poster ? ` poster="${escapeHtml(poster)}"` : ""}>
              <source src="${escapeHtml(videoSource)}" type="${escapeHtml(inferVideoType(videoSource))}" />
            </video>
            ${openLink}
          </div>
        `;
      }
      const source = item.local_src || item.src;
      if (!source) {
        return item.href
          ? `<a class="media-fallback" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">Open on ${escapeHtml(platformLabel)}</a>`
          : "";
      }
      const img = `<img src="${escapeHtml(source)}" alt="${escapeHtml(item.alt || "")}" loading="lazy" />`;
      const action = item.href
        ? `<span class="media-action">${escapeHtml(item.media_kind === "video" ? `Watch on ${platformLabel}` : "Open media")}</span>`
        : "";
      const body = `${img}${action}`;
      return item.href
        ? `<a class="media-thumb" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${body}</a>`
        : `<div class="media-thumb">${body}</div>`;
    })
    .join("");
}

function renderPreviewCards(
  cards: FeedCard[],
  inheritedMediaByIndex: Record<number, FeedMedia[]> = {},
  sourceName = "",
): string {
  if (!Array.isArray(cards) || cards.length === 0) return "";
  return cards
    .map((card: FeedCard, index: number) => {
      const image = card.image_local || card.image_url || null;
      const imageSourceHint = card.image_url || image || "";
      const inheritedMedia = Array.isArray(inheritedMediaByIndex[index])
        ? inheritedMediaByIndex[index]
        : [];
      const imageHtml =
        image && !isProfileishImage(imageSourceHint)
          ? `<div class="preview-image"><img src="${escapeHtml(image)}" alt="" loading="lazy" /></div>`
          : "";
      const quoteAvatar =
        image && isProfileishImage(imageSourceHint)
          ? `<img class="quote-avatar" src="${escapeHtml(image)}" alt="" loading="lazy" />`
          : "";
      const openTag = card.href
        ? `<a class="preview-card ${card.kind === "quoted_post" ? "preview-quote" : "preview-link"}" href="${escapeHtml(card.href)}" target="_blank" rel="noreferrer">`
        : `<div class="preview-card ${card.kind === "quoted_post" ? "preview-quote" : "preview-link"}">`;
      const closeTag = card.href ? "</a>" : "</div>";
      const nestedMedia =
        card.kind === "quoted_post" &&
        (!image || isProfileishImage(imageSourceHint)) &&
        inheritedMedia.length > 0
          ? `<div class="quote-nested-media">${renderMedia(inheritedMedia, sourceName)}</div>`
          : "";

      if (card.kind === "quoted_post") {
        return `
        ${openTag}
          ${imageHtml}
          <div class="preview-content">
            <div class="preview-meta quote-meta">${quoteAvatar}${escapeHtml(card.handle || "quoted post")}</div>
            <div class="preview-text">${escapeHtml(card.text || "")}</div>
            ${nestedMedia}
          </div>
        ${closeTag}
      `;
      }

      return `
      ${openTag}
        ${imageHtml}
        <div class="preview-content">
          <div class="preview-meta">${escapeHtml(card.domain || "link")}</div>
          <div class="preview-title">${escapeHtml(card.title || card.text || "")}</div>
          ${card.description ? `<div class="preview-desc">${escapeHtml(card.description)}</div>` : ""}
        </div>
      ${closeTag}
    `;
    })
    .join("");
}

function selectInlineMedia(
  itemCards: FeedCard[],
  mediaItems: FeedMedia[],
): {
  inlineMedia: FeedMedia[];
  inheritedMediaByIndex: Record<number, FeedMedia[]>;
} {
  const quoteCardIndex = Array.isArray(itemCards)
    ? itemCards.findIndex((card) => {
        const imageHint = card ? card.image_url || card.image_local || "" : "";
        return (
          !!card &&
          card.kind === "quoted_post" &&
          ((!card.image_local && !card.image_url) ||
            isProfileishImage(imageHint))
        );
      })
    : -1;
  const quoteCard = quoteCardIndex >= 0 ? itemCards[quoteCardIndex] : null;
  const quoteImageHint = quoteCard
    ? quoteCard.image_url || quoteCard.image_local || ""
    : "";
  const quoteConsumesMedia =
    !!quoteCard &&
    ((!quoteCard.image_local && !quoteCard.image_url) ||
      isProfileishImage(quoteImageHint)) &&
    Array.isArray(mediaItems) &&
    mediaItems.length > 0;

  const inheritedMediaByIndex: Record<number, FeedMedia[]> = {};
  let inlineMedia = Array.isArray(mediaItems) ? mediaItems : [];
  if (quoteConsumesMedia) {
    inlineMedia = [];
    inheritedMediaByIndex[quoteCardIndex] = mediaItems;
  } else if (quoteCardIndex >= 0 && inlineMedia.length > 1) {
    inheritedMediaByIndex[quoteCardIndex] = [
      inlineMedia[inlineMedia.length - 1],
    ];
    inlineMedia = inlineMedia.slice(0, -1);
  }
  return { inlineMedia, inheritedMediaByIndex };
}

function renderItemCard(
  item: FeedItem,
  previousItem: FeedItem | null = null,
): string {
  const stats = {
    reply: item.stats?.reply ?? "0",
    share: item.stats?.share ?? "0",
    like: item.stats?.like ?? "0",
    view: item.stats?.view ?? "0",
  };
  const counts = ACTIONS.map((action) =>
    renderAction(action.icon, action.label, stats[action.key]),
  ).join("");
  const thread = {
    hasThreadLine: item.thread?.has_thread_line ?? false,
    lineHeight: item.thread?.thread_line_height ?? null,
    childCandidateHandle: item.thread?.child_candidate_handle ?? null,
    childCandidateIndex: item.thread?.child_candidate_index ?? null,
  };
  const parsedLineHeight =
    thread.lineHeight != null
      ? Number.parseFloat(String(thread.lineHeight))
      : null;
  const lineHeight =
    parsedLineHeight == null || Number.isNaN(parsedLineHeight)
      ? ""
      : `${parsedLineHeight + 60}px`;
  const threadLine = thread.hasThreadLine
    ? `<div class="thread-line"${lineHeight ? ` style="--thread-line-height: ${lineHeight};"` : ""}></div>`
    : "";
  const avatarSource =
    item.author?.profile_image_local || item.author?.profile_image_url || "";
  const displayName = getAuthorName(item);
  const handle = getAuthorSecondary(item);
  const platform = getPlatformIconMeta(item.source);
  const platformIcon = getPlatformIconDataUri(item.source);
  const avatar = avatarSource
    ? `<img class="avatar-img" src="${escapeHtml(avatarSource)}" alt="${escapeHtml(displayName)}" />`
    : escapeHtml(displayName.replace(/^@/, "").slice(0, 2).toUpperCase());
  const threadNote = thread.childCandidateHandle
    ? `<div class="thread-note">Thread continues to ${escapeHtml(thread.childCandidateHandle)}${thread.childCandidateIndex != null ? ` · row ${escapeHtml(thread.childCandidateIndex)}` : ""}</div>`
    : "";
  const itemCards = item.cards || [];
  const { inlineMedia, inheritedMediaByIndex } = selectInlineMedia(
    itemCards,
    item.media || [],
  );
  const previousKeys = previousItem
    ? new Set(getItemMaskKeys(previousItem).map(String))
    : new Set();
  const suppressTopBorder =
    previousKeys.size > 0 &&
    getItemMaskKeys(item).some((key: string | number) =>
      previousKeys.has(String(key)),
    );
  const sourceClass = toSourceClass(item.source);
  const hasVideo = inlineMedia.some((media: FeedMedia) =>
    Boolean(media?.local_video_src || media?.video_src),
  );
  const cardClass = suppressTopBorder
    ? `feed-card ${sourceClass} suppress-thread-gap`
    : `feed-card ${sourceClass}`;

  const sourceBadge = `
    <span class="source-badge">
      <img class="source-badge-icon" src="${escapeHtml(platformIcon)}" alt="${escapeHtml(platform.label)}" loading="lazy" />
      <span>${escapeHtml(platform.label)}</span>
    </span>
  `;
  const openOriginal = item.url
    ? `<a class="action-pill action-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><span class="action-icon" aria-hidden="true">↗</span><span class="action-label">Open</span><span class="action-value">${escapeHtml(compactUrl(item.url))}</span></a>`
    : "";

  return `
    <article class="${cardClass}"${hasVideo ? ' data-has-video="true"' : ""}>
      <div class="rail">
        <div class="avatar">${avatar}</div>
        ${threadLine}
      </div>
      <div class="body">
        <div class="post-header">
          <div class="identity">
            <div class="identity-primary">
              <span class="display-name">${escapeHtml(displayName)}</span>
              ${handle ? `<span class="handle">${escapeHtml(handle)}</span>` : ""}
            </div>
            <div class="identity-secondary">
              ${sourceBadge}
            </div>
          </div>
        </div>
        <div class="text">${escapeHtml(item.content?.text || "")}</div>
        ${threadNote}
        ${renderPreviewCards(itemCards, inheritedMediaByIndex, item.source)}
        <div class="media">${renderMedia(inlineMedia, item.source)}</div>
        <div class="actions">
          ${counts}
          ${openOriginal}
        </div>
      </div>
    </article>
  `;
}

module.exports = {
  escapeHtml,
  renderItemCard,
  toSourceClass,
};
