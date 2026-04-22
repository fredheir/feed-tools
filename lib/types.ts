export type FeedSourceName =
  | "bluesky"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "x";

export type FeedStatValue = string | number | null;

export interface FeedAuthor {
  handle: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  profile_image_local: string | null;
}

export interface FeedContent {
  text: string;
}

export interface FeedStats {
  reply: FeedStatValue;
  share: FeedStatValue;
  like: FeedStatValue;
  view: FeedStatValue;
}

export interface FeedThread {
  has_thread_line: boolean;
  thread_line_height: string | number | null;
  thread_line_x: string | number | null;
  child_candidate_index: string | number | null;
  child_candidate_handle: string | null;
  child_candidate_url: string | null;
  relationship_confidence: string | number | null;
}

export interface FeedMedia {
  src?: string | null;
  local_src?: string | null;
  video_src?: string | null;
  local_video_src?: string | null;
  href?: string | null;
  alt?: string | null;
  media_kind?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  duration?: number | string | null;
  source?: string | null;
}

export interface FeedCard {
  kind?: string | null;
  href?: string | null;
  image_url?: string | null;
  image_local?: string | null;
  handle?: string | null;
  text?: string | null;
  title?: string | null;
  description?: string | null;
  domain?: string | null;
}

export interface FeedEmbeddedLink {
  href?: string | null;
  text?: string | null;
  kind?: string | null;
}

export interface FeedItem {
  id: string | null;
  source: string;
  source_item_id: string | null;
  index: number | null;
  url: string | null;
  author: FeedAuthor;
  content: FeedContent;
  stats: FeedStats;
  media: FeedMedia[];
  cards: FeedCard[];
  thread: FeedThread;
  embedded_links: FeedEmbeddedLink[];
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  capture_count?: number | null;
}

export interface FeedDocument {
  schema_version: number;
  source: string;
  captured_at: string | null;
  items: FeedItem[];
  mask?: FeedMask;
}

export interface FeedBrowserConfig {
  cdp?: string;
  auto_connect?: boolean;
  autoConnect?: boolean;
  headed?: boolean;
  args?: string[];
  browser_args?: string[];
  session?: string;
  session_name?: string;
  sessionName?: string;
  profile?: string;
  state?: string;
  state_path?: string;
  statePath?: string;
  allow_file_access?: boolean;
  allowFileAccess?: boolean;
  color_scheme?: string;
  colorScheme?: string;
  executable_path?: string;
  executablePath?: string;
}

export interface SourceCaptureConfig {
  default_limit?: number;
  assets_dir?: string;
  save_dir?: string;
  browser?: FeedBrowserConfig;
}

export interface SourcePreference {
  name: string;
  enabled?: boolean;
  default?: boolean;
  capture?: SourceCaptureConfig;
}

export interface RenderPreferences {
  show_summary?: boolean;
  show_tabs?: boolean;
}

export interface CurationPreferences {
  default_mode?: string;
  preferred_categories?: string[];
  allow_multi_tab_views?: boolean;
  target_items_per_tab?: number;
  fallback_category?: string;
  relevance_policy?: string;
}

export interface SummaryPreferences {
  default_style?: string;
  populate_on_request_only?: boolean;
  custom_instructions?: string;
  purpose?: string;
  prefer_minimal_agent_writing?: boolean;
}

export interface UserPreferences {
  sources?: SourcePreference[];
  render?: RenderPreferences;
  curation?: CurationPreferences;
  summary?: SummaryPreferences;
}

export interface FeedConfig {
  version?: number;
  user_preferences?: UserPreferences;
  summary?: {
    notes?: string;
  };
}

export interface NormalizedBrowserOptions {
  autoConnect: boolean;
  session: string | null;
  sessionName: string | null;
  profile: string | null;
  statePath: string | null;
  headed: boolean;
  allowFileAccess: boolean;
  colorScheme: string | null;
  executablePath: string | null;
  cdp: string | null;
  args: string[];
}

export interface AllocationEntry {
  category: string;
  updated_at?: string;
}

export interface FeedAllocation {
  version: number;
  source: string | null;
  items: Record<string, AllocationEntry>;
}

export interface FeedTabGroup {
  label?: string;
  item_ids: string[];
}

export interface FeedTab {
  label: string;
  groups?: FeedTabGroup[];
  item_ids?: string[];
  summary?: string;
}

export interface FeedMask {
  summary?: string;
  tabbed?: boolean;
  item_ids?: string[];
  tabs?: FeedTab[];
}

export interface CategoryAssignment {
  category: string;
  selection: string | string[];
}

export interface BrowserSession {
  options: NormalizedBrowserOptions;
  run: (
    commandArgs: string[],
    commandOptions?: FeedBrowserConfig & { commandTimeoutMs?: number },
  ) => string;
  getCurrentUrl: () => string;
  getTitle: () => string;
  listTabs: () => Array<{ index: number; url?: string }>;
  switchToTab: (index: number) => void;
  openNewTab: (url: string) => void;
  openPathOrUrl: (target: string) => void;
  reloadCurrentTab: () => void;
  waitMilliseconds: (milliseconds: number) => void;
  waitForLoad: (state?: string, timeoutMs?: number | null) => void;
  tryWaitForLoad: (state?: string, timeoutMs?: number | null) => boolean;
  waitForUrl: (urlPattern: string, timeoutMs?: number | null) => void;
  waitForText: (text: string, timeoutMs?: number | null) => void;
  tryWaitForText: (text: string, timeoutMs?: number | null) => boolean;
  waitForFunction: (expression: string, timeoutMs?: number | null) => void;
  tryWaitForFunction: (
    expression: string,
    timeoutMs?: number | null,
  ) => boolean;
  waitForSelector: (selector: string, timeoutMs?: number | null) => void;
  ensureTab: (urlPrefix: string | string[], openUrl: string) => string;
  evalJson: <T = unknown>(script: string) => T;
  evalText: (script: string) => string;
  snapshotText: (options?: string[], timeoutMs?: number) => string;
  getHtml: (selector: string, timeoutMs?: number) => string;
}
