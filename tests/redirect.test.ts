import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  getRedirectionResult,
  redirectToAutoNovel,
} from "../src/entrypoints/background/redirect.ts";
import { BOOKS_ORIGIN } from "../src/shared/deployment.ts";

describe("source novel redirects", () => {
  const cases = [
    ["https://nailain.alwaysdata.net/posts/12612524", "nailain", "12612524"],
    [
      "https://nailain.alwaysdata.net/posts/12612524/?from=archive#body",
      "nailain",
      "12612524",
    ],
    ["https://kakuyomu.jp/works/123", "kakuyomu", "123"],
    ["https://kakuyomu.jp/works/123/episodes/456", "kakuyomu", "123"],
    ["https://ncode.syosetu.com/N1234AB/", "syosetu", "n1234ab"],
    ["https://ncode.syosetu.com/n1234ab/10/", "syosetu", "n1234ab"],
    ["https://novel18.syosetu.com/n1234ab/", "syosetu", "n1234ab"],
    ["https://novelup.plus/story/123", "novelup", "123"],
    ["https://novelup.plus/story/123/456", "novelup", "123"],
    ["https://syosetu.org/novel/123/", "hameln", "123"],
    ["https://h.syosetu.org/novel/123/1.html", "hameln", "123"],
    ["https://www.syosetu.org/novel/123/", "hameln", "123"],
    ["https://www.pixiv.net/novel/series/123", "pixiv", "123"],
    ["https://pixiv.net/novel/show.php?id=456", "pixiv", "s456"],
    [
      "https://www.pixiv.net/novel/show.php?mode=cover&id=456#body",
      "pixiv",
      "s456",
    ],
    ["https://www.alphapolis.co.jp/novel/123/456", "alphapolis", "123-456"],
    [
      "https://www.alphapolis.co.jp/novel/123/456/episode/789",
      "alphapolis",
      "123-456",
    ],
    ["https://alphapolis.co.jp/novel/123/456/", "alphapolis", "123-456"],
    ["https://novelism.jp/novel/old-Slug_1/", "novelism", "old-Slug_1"],
    [
      "https://novelism.jp/novel/old-Slug_1/article/chapter-2/",
      "novelism",
      "old-Slug_1",
    ],
  ] as const;
  for (const [url, providerId, novelId] of cases) {
    it(`recognizes ${url}`, () => {
      assert.deepEqual(getRedirectionResult(url), {
        providerId,
        novelId,
        url: `${BOOKS_ORIGIN}/novel/${providerId}/${novelId}`,
      });
    });
  }

  const unsupported = [
    "not a URL",
    "https:nailain.alwaysdata.net/posts/123",
    "//nailain.alwaysdata.net/posts/123",
    "javascript:https://nailain.alwaysdata.net/posts/123",
    "ftp://nailain.alwaysdata.net/posts/123",
    "https://nailain.alwaysdata.net.evil.test/posts/123",
    "https://evil.test/nailain.alwaysdata.net/posts/123",
    "https://evil.test/?url=https://nailain.alwaysdata.net/posts/123",
    "https://nailain.alwaysdata.net@evil.test/posts/123",
    "https://user:password@nailain.alwaysdata.net/posts/123",
    "https://nailain.alwaysdata.net:8443/posts/123",
    "https://nailain.alwaysdata.net\\posts\\123",
    "https://nailain.alwaysdata.net/posts/12\n3",
    "https://nailain.alwaysdata.net/posts/12 3",
    "https://nailain.alwaysdata.net/",
    "https://nailain.alwaysdata.net/login?next=/posts/123",
    "https://nailain.alwaysdata.net/api/posts/123",
    "https://nailain.alwaysdata.net/posts/123junk",
    "https://nailain.alwaysdata.net/posts/123/extra",
    "https://nailain.alwaysdata.net/posts/%31%32%33",
    "https://kakuyomu.jp.evil.test/works/123",
    "https://kakuyomu.jp/not-works/123",
    "https://kakuyomu.jp/works/123junk",
    "https://kakuyomu.jp/works/123/not-an-episode",
    "https://ncode.syosetu.com.evil.test/n1234ab/",
    "https://ncode.syosetu.com/search/",
    "https://novelup.plus/story/123junk",
    "https://syosetu.org/novel/123junk",
    "https://syosetu.org/novel/123/1.html/extra",
    "https://www.pixiv.net/novel/show.php?id=456junk",
    "https://www.pixiv.net/novel/show.php?id=456&id=789",
    "https://www.pixiv.net/novel/show.php?other=456",
    "https://www.pixiv.net/novel/series/123junk",
    "https://www.alphapolis.co.jp/novel/123/456junk",
    "https://www.alphapolis.co.jp.evil.test/novel/123/456",
    "https://novelism.jp/novel/foo%2Fbar",
  ];
  for (const url of unsupported) {
    it(`ignores unsupported or malformed ${JSON.stringify(url)}`, () => {
      assert.equal(getRedirectionResult(url), null);
    });
  }
});

describe("toolbar redirect", () => {
  afterEach(() => Reflect.deleteProperty(globalThis, "browser"));

  it("opens the selected NAILAIN article on this installation", () => {
    const opened: unknown[] = [];
    Reflect.set(globalThis, "browser", {
      tabs: {
        query: (_query: unknown, callback: (tabs: unknown[]) => void) =>
          callback([{ url: "https://nailain.alwaysdata.net/posts/12612524" }]),
        create: (options: unknown) => opened.push(options),
      },
    });
    redirectToAutoNovel();
    assert.deepEqual(opened, [
      {
        url: `${BOOKS_ORIGIN}/novel/nailain/12612524`,
        active: true,
      },
    ]);
  });

  it("does nothing when no active tab is available", () => {
    Reflect.set(globalThis, "browser", {
      tabs: {
        query: (_query: unknown, callback: (tabs: unknown[]) => void) =>
          callback([]),
        create: () => assert.fail("must not create a tab"),
      },
    });
    assert.doesNotThrow(() => redirectToAutoNovel());
  });
});
