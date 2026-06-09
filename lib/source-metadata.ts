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
