export function getRenderCss(): string {
  return `
    :root {
      --bg: #edf2f7;
      --panel: rgba(255, 255, 255, 0.94);
      --panel-strong: #ffffff;
      --line: #d5dde6;
      --text: #101418;
      --muted: #5c6977;
      --accent: #0f7ae5;
      --accent-soft: #e9f2ff;
      --border: #dde5ec;
      --shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(95, 150, 255, 0.12) 0, transparent 24%), linear-gradient(180deg, #f9fbfd 0%, var(--bg) 100%); color: var(--text); }
    .app-shell { max-width: 760px; margin: 0 auto; padding: 16px 12px 48px; }
    .app-topbar { position: sticky; top: 0; z-index: 30; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 12px; padding: 14px 16px 12px; border-bottom: 1px solid rgba(221, 229, 236, 0.9); background: rgba(249, 251, 253, 0.92); backdrop-filter: blur(14px); }
    .app-brand { display: grid; gap: 3px; }
    .app-kicker { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .app-topbar h1 { margin: 0; font-size: 26px; line-height: 1; letter-spacing: -0.03em; }
    .app-status { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .status-chip { display: inline-flex; align-items: center; padding: 7px 10px; border: 1px solid var(--border); border-radius: 999px; background: rgba(255,255,255,0.88); color: var(--muted); font-size: 12px; font-weight: 700; }
    .feed-briefing { margin-bottom: 14px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,250,253,0.98)); box-shadow: var(--shadow); }
    .briefing-label { margin-bottom: 6px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .feed-briefing p { margin: 0; color: #25313d; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .feed { display: grid; gap: 0; border: 1px solid var(--border); border-radius: 22px; overflow: hidden; background: var(--panel-strong); box-shadow: var(--shadow); }
    .tab-shell { display: grid; gap: 10px; margin-bottom: 14px; }
    .tab-toggle, .platform-toggle { display: none; }
    .tab-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 8px 0; }
    .tab-label-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .platform-filter-group { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .tab-label { padding: 8px 12px; border: 1px solid var(--border); border-radius: 999px; background: rgba(255,255,255,0.82); color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; }
    .filter-divider { width: 1px; height: 28px; margin: 0 2px; background: rgba(207, 217, 222, 0.95); }
    .platform-filter-label { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 999px; background: rgba(255,255,255,0.82); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; transition: opacity 120ms ease, filter 120ms ease, background 120ms ease, box-shadow 120ms ease; }
    .platform-filter-icon { width: 24px; height: 24px; border-radius: 8px; object-fit: cover; }
    .tab-panels { display: grid; gap: 14px; }
    .tab-panels > .tab-panel { display: grid; gap: 10px; }
    .tab-summary { margin-bottom: 10px; padding: 0 2px; color: var(--muted); font-size: 13px; line-height: 1.35; white-space: pre-wrap; }
    .group-block { display: grid; gap: 0; }
    .group-block + .group-block { margin-top: 14px; position: relative; }
    .group-block + .group-block::before { content: ""; display: block; height: 1px; margin: 0 14px 10px; background: linear-gradient(90deg, rgba(207, 217, 222, 0), rgba(207, 217, 222, 0.95) 18%, rgba(207, 217, 222, 0.95) 82%, rgba(207, 217, 222, 0)); }
    .group-label { display: block; margin: 0 -16px 0 -12px; padding: 9px 16px 9px 28px; color: #24313b; background: rgba(239, 244, 248, 0.95); border-left: 1px solid rgba(221, 229, 236, 0.95); border-right: 1px solid rgba(221, 229, 236, 0.95); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .feed-card { display: grid; grid-template-columns: 56px 1fr; gap: 0; padding: 14px 16px 14px 12px; border-top: 1px solid var(--border); background: linear-gradient(180deg, rgba(255,255,255,0.99), rgba(249,251,253,0.99)); transition: background 140ms ease; }
    .feed-card:hover { background: linear-gradient(180deg, rgba(252,253,255,0.98), rgba(246,250,254,0.98)); }
    .feed-card:first-child, .feed-card.suppress-thread-gap { border-top: 0; }
    .rail { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 100%; padding-top: 2px; }
    .avatar { position: relative; z-index: 2; width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center; background: linear-gradient(135deg, #1d9bf0, #6ed3ff); color: white; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; box-shadow: 0 8px 20px rgba(110, 125, 140, 0.28); overflow: hidden; }
    .avatar-img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .thread-line { position: absolute; top: 42px; width: 2px; height: var(--thread-line-height, calc(100% - 56px)); background: var(--line); border-radius: 2px; }
    .body { min-width: 0; display: grid; gap: 12px; }
    .post-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .identity { min-width: 0; display: grid; gap: 4px; }
    .identity-primary { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; min-width: 0; }
    .identity-secondary { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
    .display-name { font-size: 15px; font-weight: 800; line-height: 1.2; }
    .handle { color: var(--muted); font-size: 14px; line-height: 1.2; }
    .source-badge, .meta-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .source-badge { border: 1px solid rgba(15, 122, 229, 0.12); background: var(--accent-soft); color: #0f5eb0; }
    .source-badge-icon { width: 16px; height: 16px; border-radius: 999px; object-fit: cover; }
    .meta-chip { border: 1px solid var(--border); background: rgba(246, 249, 252, 0.98); color: var(--muted); }
    .meta-chip-tools { font-variant-numeric: tabular-nums; }
    .text { font-size: 17px; line-height: 1.42; white-space: pre-wrap; }
    .thread-note { color: var(--accent); font-size: 13px; font-weight: 600; }
    .preview-card { display: grid; grid-template-columns: 220px 1fr; text-decoration: none; border: 1px solid var(--border); overflow: hidden; color: inherit; background: #fff; transition: background 120ms ease; }
    .preview-card:hover { background: rgba(0, 0, 0, 0.014); }
    .preview-quote { grid-template-columns: 1fr; border-radius: 10px; padding: 8px 10px; transition: background 120ms ease; }
    .preview-quote:hover { background: rgba(0, 0, 0, 0.018); }
    .preview-link { border-radius: 10px; }
    .preview-image img { display: block; width: 100%; height: 100%; min-height: 148px; object-fit: cover; background: #dde6ea; }
    .preview-content { padding: 8px 10px; display: grid; gap: 4px; }
    .preview-meta { color: var(--muted); font-size: 13px; }
    .quote-meta { display: flex; align-items: center; gap: 8px; }
    .quote-avatar { width: 20px; height: 20px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; }
    .preview-text { font-size: 15px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .preview-title { font-size: 16px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .preview-desc { color: var(--muted); font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .media { display: grid; gap: 10px; width: 100%; }
    .media-player { display: grid; gap: 8px; width: 100%; }
    .media-fallback { display: inline-flex; align-items: center; justify-content: center; min-height: 72px; padding: 12px 14px; border: 1px dashed rgba(15, 122, 229, 0.3); border-radius: 16px; background: rgba(233, 242, 255, 0.5); color: #0f5eb0; font-size: 13px; font-weight: 700; text-decoration: none; }
    .media-thumb { display: block; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); background: #dfe8eb; text-decoration: none; position: relative; }
    .media-thumb img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; background: #dfe8eb; }
    .media-video { display: block; width: 100%; max-height: min(78vh, 960px); aspect-ratio: 9 / 16; border-radius: 16px; border: 1px solid var(--border); background: #000; object-fit: contain; }
    .media-player.landscape .media-video { aspect-ratio: 16 / 9; }
    .media-player.landscape .media-thumb img { aspect-ratio: 16 / 9; }
    .media-action { position: absolute; right: 10px; bottom: 10px; padding: 7px 10px; border-radius: 8px; background: rgba(15, 20, 25, 0.8); color: white; font-size: 12px; font-weight: 700; }
    .media-link { color: var(--muted); font-size: 12px; font-weight: 600; text-decoration: none; }
    .actions { color: var(--muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .action-pill { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 7px 10px; border-radius: 999px; color: var(--muted); background: rgba(246,249,252,0.98); border: 1px solid rgba(221, 229, 236, 0.95); text-decoration: none; }
    .action-link { margin-left: auto; max-width: 100%; }
    .action-icon { font-size: 13px; line-height: 1; opacity: 0.85; }
    .action-label { font-size: 12px; font-weight: 700; }
    .action-value { max-width: 180px; font-size: 12px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    @media (max-width: 720px) {
      .app-shell { padding: 10px 6px 40px; }
      .app-topbar { top: 0; align-items: flex-start; flex-direction: column; padding: 12px 12px 10px; }
      .app-topbar h1 { font-size: 22px; }
      .app-status { justify-content: flex-start; }
      .feed-card { grid-template-columns: 46px 1fr; padding: 12px 12px 14px 10px; }
      .text { font-size: 15px; }
      .avatar { width: 34px; height: 34px; font-size: 11px; }
      .thread-line { top: 36px; }
      .preview-card { grid-template-columns: 1fr; }
      .group-label { margin: 0 -12px 0 -10px; padding: 7px 12px 7px 20px; }
      .media-video { max-height: 62vh; }
      .action-link { margin-left: 0; width: 100%; }
      .action-value { max-width: none; }
    }
  `;
}
