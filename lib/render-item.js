"use strict";

const {
  getItemHandle,
  getItemMedia,
  getItemCards,
  getItemProfileImage,
  getItemStats,
  getItemText,
  getItemThread,
  getItemMaskKeys,
} = require("./item");
const {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} = require("./platform-icons");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStat(icon, value) {
  return `<span class="stat-pill"><span class="stat-icon">${icon}</span><span class="stat-value">${escapeHtml(value ?? "0")}</span></span>`;
}

function isProfileishImage(value) {
  return (
    !!value &&
    (/profile_images/.test(value) ||
      /_mini\./.test(value) ||
      /_normal\./.test(value))
  );
}

function renderMedia(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      const source = item.local_src || item.src;
      const img = `<img src="${escapeHtml(source)}" alt="${escapeHtml(item.alt || "")}" loading="lazy" />`;
      const action = item.href
        ? `<span class="media-action">${escapeHtml(item.media_kind === "video" ? "View video on platform" : "Open media")}</span>`
        : "";
      const body = `${img}${action}`;
      return item.href
        ? `<a class="media-thumb" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${body}</a>`
        : `<div class="media-thumb">${body}</div>`;
    })
    .join("");
}

function renderPreviewCards(cards, inheritedMediaByIndex = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return "";
  return cards
    .map((card, index) => {
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
          ? `<div class="quote-nested-media">${renderMedia(inheritedMedia)}</div>`
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

function selectInlineMedia(itemCards, mediaItems) {
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

  const inheritedMediaByIndex = {};
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

function renderItemCard(item, previousItem) {
  const stats = getItemStats(item);
  const counts = [
    renderStat("↩", stats.reply),
    renderStat("⟲", stats.share),
    renderStat("♡", stats.like),
    renderStat("▥", stats.view),
  ].join("");
  const thread = getItemThread(item);
  const parsedLineHeight =
    thread.lineHeight != null ? Number.parseFloat(thread.lineHeight) : null;
  const lineHeight =
    parsedLineHeight == null || Number.isNaN(parsedLineHeight)
      ? ""
      : `${parsedLineHeight + 60}px`;
  const threadLine = thread.hasThreadLine
    ? `<div class="thread-line"${lineHeight ? ` style="--thread-line-height: ${lineHeight};"` : ""}></div>`
    : "";
  const avatarSource = getItemProfileImage(item);
  const handle = getItemHandle(item);
  const platform = getPlatformIconMeta(item.source);
  const platformIcon = getPlatformIconDataUri(item.source);
  const avatar = avatarSource
    ? `<img class="avatar-img" src="${escapeHtml(avatarSource)}" alt="${escapeHtml(handle)}" />`
    : escapeHtml((handle || "?").replace("@", "").slice(0, 2).toUpperCase());
  const threadNote = thread.childCandidateHandle
    ? `<div class="thread-note">continues to ${escapeHtml(thread.childCandidateHandle)} (row ${escapeHtml(thread.childCandidateIndex)})</div>`
    : "";
  const itemCards = getItemCards(item);
  const { inlineMedia, inheritedMediaByIndex } = selectInlineMedia(
    itemCards,
    getItemMedia(item),
  );
  const previousKeys = previousItem
    ? new Set(getItemMaskKeys(previousItem).map(String))
    : new Set();
  const suppressTopBorder =
    previousKeys.size > 0 &&
    getItemMaskKeys(item).some((key) => previousKeys.has(String(key)));
  const sourceClass = `source-${String(item.source || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
  const cardClass = suppressTopBorder
    ? `feed-card ${sourceClass} suppress-thread-gap`
    : `feed-card ${sourceClass}`;

  return `
    <article class="${cardClass}">
      <div class="rail">
        <div class="avatar">${avatar}</div>
        <img class="platform-mark rail-platform-mark" src="${escapeHtml(platformIcon)}" alt="${escapeHtml(platform.label)}" loading="lazy" />
        ${threadLine}
      </div>
      <div class="body">
        <div class="meta">
          <span class="handle">${escapeHtml(handle)}</span>
          <span class="index">#${escapeHtml(item.index)}</span>
        </div>
        <div class="text">${escapeHtml(getItemText(item))}</div>
        ${threadNote}
        ${renderPreviewCards(itemCards, inheritedMediaByIndex)}
        <div class="media">${renderMedia(inlineMedia)}</div>
        <div class="stats">${counts}<span class="stats-link"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></span></div>
      </div>
    </article>
  `;
}

module.exports = {
  escapeHtml,
  renderItemCard,
};
