import { describe, expect, test } from "vitest";
import {
  cleanAuthorHeading,
  extractCardFromLabel,
  extractHrefFromHtml,
  extractImageSrcFromHtml,
  isAgeLabel,
  isFacebookStopHeading,
  isNoiseStaticText,
  parseSnapshotLine,
} from "../sources/facebook/parse.js";

describe("facebook parse helpers", () => {
  test("parses snapshot lines with refs and heading metadata", () => {
    expect(parseSnapshotLine('  - heading "Reels" [ref=e42] level=3')).toEqual({
      indent: 2,
      raw: '- heading "Reels" [ref=e42] level=3',
      type: "heading",
      label: "Reels",
      ref: "e42",
      level: 3,
    });
    expect(
      isFacebookStopHeading(parseSnapshotLine('- heading "Reels" level=3')),
    ).toBe(true);
  });

  test("extracts href and image sources from html snippets", () => {
    expect(
      extractHrefFromHtml('<a href="https://example.com?a=1&amp;b=2">x</a>'),
    ).toBe("https://example.com?a=1&b=2");
    expect(
      extractImageSrcFromHtml('<img src="https://example.com/a.jpg" />'),
    ).toBe("https://example.com/a.jpg");
  });

  test("classifies age labels, noise labels, and author headings", () => {
    expect(isAgeLabel("3 hours ago")).toBe(true);
    expect(isNoiseStaticText("Facebook")).toBe(true);
    expect(
      cleanAuthorHeading("Alex Example updated his profile picture."),
    ).toEqual({
      author: "Alex Example",
      impliedText: "updated profile picture.",
    });
  });

  test("extracts external cards from domain-prefixed labels", () => {
    expect(extractCardFromLabel("example.com Launch notes")).toEqual({
      kind: "external_card",
      href: null,
      domain: "example.com",
      title: "Launch notes",
      description: null,
      text: "example.com Launch notes",
      image_url: null,
    });
  });
});
