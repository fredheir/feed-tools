"use strict";

function getRenderCss() {
  return `
    :root {
      --bg: #eef3f4;
      --panel: #ffffff;
      --line: #cfd9de;
      --text: #0f1419;
      --muted: #536471;
      --accent: #1d9bf0;
      --border: #e5eaec;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #dcecf0 0, transparent 28%), linear-gradient(180deg, #f7fbfc 0%, var(--bg) 100%); color: var(--text); }
    .page { max-width: 980px; margin: 0 auto; padding: 18px 14px 48px; }
    .header { margin-bottom: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: rgba(232, 238, 242, 0.94); backdrop-filter: blur(10px); }
    .header h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.1; color: #0a0f14; }
    .header p { margin: 0; color: #2d3b46; font-size: 14px; line-height: 1.4; white-space: pre-wrap; }
    .feed { display: grid; gap: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel); box-shadow: 0 24px 80px rgba(19, 35, 52, 0.08); }
    .tab-shell { display: grid; gap: 10px; margin-bottom: 14px; }
    .tab-toggle { display: none; }
    .tab-bar { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab-label { padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,0.78); color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; }
    .tab-panels > .tab-panel { display: none; }
    .tab-summary { margin-bottom: 10px; padding: 0 2px; color: var(--muted); font-size: 13px; line-height: 1.35; white-space: pre-wrap; }
    .group-block { display: grid; gap: 0; }
    .group-block + .group-block { margin-top: 14px; position: relative; }
    .group-block + .group-block::before { content: ""; display: block; height: 1px; margin: 0 14px 10px; background: linear-gradient(90deg, rgba(207, 217, 222, 0), rgba(207, 217, 222, 0.95) 18%, rgba(207, 217, 222, 0.95) 82%, rgba(207, 217, 222, 0)); }
    .group-label { display: block; margin: 0 -14px 0 -10px; padding: 7px 14px 7px 26px; color: #24313b; background: rgba(223, 231, 236, 0.95); border-left: 1px solid rgba(201, 212, 219, 0.95); border-right: 1px solid rgba(201, 212, 219, 0.95); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .tweet-card { display: grid; grid-template-columns: 72px 1fr; gap: 0; padding: 12px 14px 12px 10px; border-top: 1px solid var(--border); background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,253,0.98)); transition: background 140ms ease; }
    .tweet-card:hover { background: linear-gradient(180deg, rgba(250,252,254,0.98), rgba(246,249,252,0.98)); }
    .tweet-card:first-child, .tweet-card.suppress-thread-gap { border-top: 0; }
    .rail { position: relative; display: flex; justify-content: center; min-height: 100%; }
    .avatar { position: relative; z-index: 2; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, #1d9bf0, #6ed3ff); color: white; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; box-shadow: 0 8px 20px rgba(110, 125, 140, 0.28); overflow: hidden; }
    .avatar-img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .thread-line { position: absolute; top: 42px; width: 2px; height: var(--thread-line-height, calc(100% - 60px)); background: var(--line); border-radius: 2px; }
    .body { min-width: 0; display: grid; gap: 8px; }
    .meta { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
    .handle { font-weight: 700; font-size: 14px; }
    .index { color: var(--muted); font-size: 12px; }
    .text { font-size: 17px; line-height: 1.38; white-space: pre-wrap; }
    .thread-note { color: var(--accent); font-size: 13px; font-weight: 600; }
    .preview-card { display: grid; grid-template-columns: 180px 1fr; text-decoration: none; border: 1px solid var(--border); overflow: hidden; color: inherit; background: #fff; transition: background 120ms ease; }
    .preview-card:hover { background: rgba(0, 0, 0, 0.014); }
    .preview-quote { grid-template-columns: 1fr; border-radius: 10px; padding: 8px 10px; transition: background 120ms ease; }
    .preview-quote:hover { background: rgba(0, 0, 0, 0.018); }
    .preview-link { border-radius: 10px; }
    .preview-image img { display: block; width: 100%; height: 100%; min-height: 112px; object-fit: cover; background: #dde6ea; }
    .preview-content { padding: 8px 10px; display: grid; gap: 4px; }
    .preview-meta { color: var(--muted); font-size: 13px; }
    .quote-meta { display: flex; align-items: center; gap: 8px; }
    .quote-avatar { width: 20px; height: 20px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; }
    .preview-text { font-size: 15px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .preview-title { font-size: 16px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .preview-desc { color: var(--muted); font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .media { display: flex; flex-wrap: wrap; gap: 8px; }
    .media-thumb { display: block; width: min(100%, 320px); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: #dfe8eb; text-decoration: none; position: relative; }
    .media-thumb img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: #dfe8eb; }
    .media-action { position: absolute; right: 10px; bottom: 10px; padding: 7px 10px; border-radius: 8px; background: rgba(15, 20, 25, 0.8); color: white; font-size: 12px; font-weight: 700; }
    .stats { color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
    .stats-link { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .stats-link a { color: var(--muted); text-decoration: none; font-size: 12px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat-pill { display: inline-flex; align-items: center; gap: 5px; min-width: 0; flex: 0 0 auto; }
    .stat-icon { font-size: 14px; line-height: 1; opacity: 0.8; }
    .stat-value { font-size: 12px; line-height: 1; }
    @media (max-width: 720px) {
      .tweet-card { grid-template-columns: 56px 1fr; padding: 11px 12px 11px 8px; }
      .text { font-size: 15px; }
      .avatar { width: 34px; height: 34px; font-size: 11px; }
      .thread-line { top: 36px; }
      .preview-card { grid-template-columns: 1fr; }
      .group-label { margin: 0 -12px 0 -8px; padding: 7px 12px 7px 20px; }
    }
  `;
}

module.exports = {
  getRenderCss,
};
