# Facebook Capture Patterns

This source is not maintained from generic DOM text scraping. Facebook obfuscates
the timestamp/status line and broad container text pulls in garbage.

Use the compact `agent-browser snapshot -c` output as the primary structure
signal.

Verified feed pattern:

1. `heading(level=3) "Feed posts"` marks the start of the main feed region.
2. Each post starts with `heading(level=4)` for the author or page name.
3. The next age link exists, but its visible DOM text is intentionally noisy and
   should be ignored.
4. `button "Actions for this post"` is the stable post anchor.
5. Post body content appears as nearby `StaticText` nodes after the header.
6. Optional body expansion appears as `button "See more"`.
7. Media appears as labeled links such as `No photo description available.`,
   `May be pop art`, or a card image title.
8. The engagement row is exposed by `Like`, `React`, `Leave a comment`, and
   sometimes `Send this to friends or post it on your profile.`

Maintenance rules:

- Do not trust broad `innerText` from parent containers.
- Ignore text from the age link subtree entirely.
- Ignore `StaticText` nested under link nodes unless the link label itself is
  the intended content.
- Treat headings like `Reels`, `Sponsored`, `Friend requests`, `Contacts`, and
  `Group chats` as feed-section boundaries, not posts.
- Expect source-native Facebook permalinks to be harder to recover than the
  visible content. Synthetic IDs are acceptable until a stable permalink signal
  is found.
