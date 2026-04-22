export function getRenderCss(): string {
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
    .page { max-width: 860px; margin: 0 auto; padding: 20px 16px 56px; }
    .header { margin-bottom: 16px; padding: 16px 18px; border: 1px solid var(--border); border-radius: 18px; background: rgba(232, 238, 242, 0.94); backdrop-filter: blur(10px); }
    .header h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.1; color: #0a0f14; }
    .header p { margin: 0; color: #2d3b46; font-size: 14px; line-height: 1.4; white-space: pre-wrap; }
    .feed { display: grid; gap: 0; border: 1px solid var(--border); border-radius: 20px; overflow: hidden; background: var(--panel); box-shadow: 0 24px 80px rgba(19, 35, 52, 0.08); }
    .tab-shell { display: grid; gap: 10px; margin-bottom: 14px; }
    .tab-toggle, .platform-toggle { display: none; }
    .tab-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .tab-label-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .platform-filter-group { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .tab-label { padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,0.78); color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; }
    .filter-divider { width: 1px; height: 28px; margin: 0 2px; background: rgba(207, 217, 222, 0.95); }
    .platform-filter-label { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,0.78); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; transition: opacity 120ms ease, filter 120ms ease, background 120ms ease, box-shadow 120ms ease; }
    .platform-filter-icon { width: 24px; height: 24px; border-radius: 8px; object-fit: cover; }
    .tab-panels { display: grid; gap: 14px; }
    .tab-panels > .tab-panel { display: grid; gap: 10px; }
    .tab-summary { margin-bottom: 10px; padding: 0 2px; color: var(--muted); font-size: 13px; line-height: 1.35; white-space: pre-wrap; }
    .group-block { display: grid; gap: 0; }
    .group-block + .group-block { margin-top: 14px; position: relative; }
    .group-block + .group-block::before { content: ""; display: block; height: 1px; margin: 0 14px 10px; background: linear-gradient(90deg, rgba(207, 217, 222, 0), rgba(207, 217, 222, 0.95) 18%, rgba(207, 217, 222, 0.95) 82%, rgba(207, 217, 222, 0)); }
    .group-label { display: block; margin: 0 -16px 0 -12px; padding: 8px 16px 8px 28px; color: #24313b; background: rgba(223, 231, 236, 0.95); border-left: 1px solid rgba(201, 212, 219, 0.95); border-right: 1px solid rgba(201, 212, 219, 0.95); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .feed-card { display: grid; grid-template-columns: 64px 1fr; gap: 0; padding: 16px 18px 18px 14px; border-top: 1px solid var(--border); background: linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,251,253,0.99)); transition: background 140ms ease; }
    .feed-card:hover { background: linear-gradient(180deg, rgba(250,252,254,0.98), rgba(246,249,252,0.98)); }
    .feed-card:first-child, .feed-card.suppress-thread-gap { border-top: 0; }
    .rail { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 100%; }
    .avatar { position: relative; z-index: 2; width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #1d9bf0, #6ed3ff); color: white; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; box-shadow: 0 8px 20px rgba(110, 125, 140, 0.28); overflow: hidden; }
    .avatar-img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .thread-line { position: absolute; top: 46px; width: 2px; height: var(--thread-line-height, calc(100% - 60px)); background: var(--line); border-radius: 2px; }
    .body { min-width: 0; display: grid; gap: 12px; }
    .meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .platform-mark { width: 44px; height: 44px; border-radius: 14px; object-fit: cover; box-shadow: 0 8px 20px rgba(110, 125, 140, 0.18); flex: 0 0 auto; align-self: center; }
    .rail-platform-mark { position: relative; z-index: 2; }
    .handle { font-weight: 700; font-size: 15px; }
    .index { color: var(--muted); font-size: 12px; }
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
    .media-thumb { display: block; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); background: #dfe8eb; text-decoration: none; position: relative; }
    .media-thumb img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; background: #dfe8eb; }
    .media-video { display: block; width: 100%; max-height: min(78vh, 960px); aspect-ratio: 9 / 16; border-radius: 16px; border: 1px solid var(--border); background: #000; object-fit: contain; }
    .media-player.landscape .media-video { aspect-ratio: 16 / 9; }
    .media-player.landscape .media-thumb img { aspect-ratio: 16 / 9; }
    .media-action { position: absolute; right: 10px; bottom: 10px; padding: 7px 10px; border-radius: 8px; background: rgba(15, 20, 25, 0.8); color: white; font-size: 12px; font-weight: 700; }
    .media-link { color: var(--muted); font-size: 12px; font-weight: 600; text-decoration: none; }
    .stats { color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
    .stats-link { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .stats-link a { color: var(--muted); text-decoration: none; font-size: 12px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat-pill { display: inline-flex; align-items: center; gap: 5px; min-width: 0; flex: 0 0 auto; }
    .stat-icon { font-size: 14px; line-height: 1; opacity: 0.8; }
    .stat-value { font-size: 12px; line-height: 1; }
    @media (max-width: 720px) {
      .page { padding: 14px 8px 42px; }
      .feed-card { grid-template-columns: 52px 1fr; padding: 12px 12px 14px 10px; }
      .text { font-size: 15px; }
      .avatar { width: 34px; height: 34px; font-size: 11px; }
      .platform-mark { width: 34px; height: 34px; }
      .thread-line { top: 36px; }
      .preview-card { grid-template-columns: 1fr; }
      .group-label { margin: 0 -12px 0 -10px; padding: 7px 12px 7px 20px; }
      .media-video { max-height: 62vh; }
    }
  `;
}
