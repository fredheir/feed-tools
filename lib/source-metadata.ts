export const SOURCE_NAMES = Object.freeze([
  "bluesky",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "x",
] as const);

export type FeedSourceName = (typeof SOURCE_NAMES)[number];

export interface SourceSigninTarget {
  url: string;
  authCookies: Array<{ domains: string[]; names: string[] }>;
}

export interface SourceAccessPolicy {
  urlPrefixes: string[];
  blockedUrlPatterns: string[];
  blockedTextPatterns: string[];
}

export const SOURCE_SIGNIN_TARGETS = {
  x: {
    url: "https://x.com/home",
    authCookies: [{ domains: ["x.com", "twitter.com"], names: ["auth_token"] }],
  },
  bluesky: {
    url: "https://bsky.app/",
    authCookies: [
      { domains: ["bsky.app", "bsky.social"], names: ["sid", "session"] },
    ],
  },
  facebook: {
    url: "https://www.facebook.com/",
    authCookies: [{ domains: ["facebook.com"], names: ["c_user"] }],
  },
  instagram: {
    url: "https://www.instagram.com/",
    authCookies: [{ domains: ["instagram.com"], names: ["sessionid"] }],
  },
  linkedin: {
    url: "https://www.linkedin.com/feed/",
    authCookies: [{ domains: ["linkedin.com"], names: ["li_at"] }],
  },
  tiktok: {
    url: "https://www.tiktok.com/",
    authCookies: [
      { domains: ["tiktok.com"], names: ["sessionid", "sessionid_ss"] },
    ],
  },
  youtube: {
    url: "https://www.youtube.com/",
    authCookies: [
      {
        domains: ["youtube.com", "google.com"],
        names: ["SID", "HSID", "SSID", "APISID", "SAPISID"],
      },
    ],
  },
} satisfies Record<FeedSourceName, SourceSigninTarget>;

export const SOURCE_ACCESS_POLICIES = {
  x: {
    urlPrefixes: ["https://x.com/", "https://twitter.com/"],
    blockedUrlPatterns: ["/i/flow/login"],
    blockedTextPatterns: ["log in", "sign in"],
  },
  bluesky: {
    urlPrefixes: ["https://bsky.app/"],
    blockedUrlPatterns: ["/login"],
    blockedTextPatterns: ["sign in", "create account"],
  },
  facebook: {
    urlPrefixes: ["https://www.facebook.com/", "https://m.facebook.com/"],
    blockedUrlPatterns: ["/login", "/checkpoint"],
    blockedTextPatterns: [
      "log in to facebook",
      "forgotten password",
      "forgot password",
    ],
  },
  instagram: {
    urlPrefixes: ["https://www.instagram.com/"],
    blockedUrlPatterns: ["/accounts/login", "/challenge/", "/checkpoint/"],
    blockedTextPatterns: ["log in"],
  },
  linkedin: {
    urlPrefixes: ["https://www.linkedin.com/feed"],
    blockedUrlPatterns: ["/login", "/authwall"],
    blockedTextPatterns: ["sign in", "join now"],
  },
  tiktok: {
    urlPrefixes: ["https://www.tiktok.com/"],
    blockedUrlPatterns: ["/login", "captcha"],
    blockedTextPatterns: ["log in", "captcha"],
  },
  youtube: {
    urlPrefixes: ["https://www.youtube.com/"],
    blockedUrlPatterns: ["consent", "sorry"],
    blockedTextPatterns: ["Turn on history", "Make YouTube your own"],
  },
} satisfies Record<FeedSourceName, SourceAccessPolicy>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSourceAccessRegexps(sourceName: FeedSourceName): {
  blockedUrlPatterns: RegExp[];
  blockedTextPatterns: RegExp[];
} {
  const policy = SOURCE_ACCESS_POLICIES[sourceName];
  return {
    blockedUrlPatterns: policy.blockedUrlPatterns.map(
      (pattern) => new RegExp(escapeRegExp(pattern), "i"),
    ),
    blockedTextPatterns: policy.blockedTextPatterns.map(
      (pattern) => new RegExp(escapeRegExp(pattern), "i"),
    ),
  };
}
