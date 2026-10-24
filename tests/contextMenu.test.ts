import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  BOOKS_ORIGIN,
  NAILAIN_MATCH_PATTERN,
  RELEASES_URL,
} from "../src/shared/deployment.ts";

// Keep unrelated logging/version build globals outside this browser boundary test.
mock.module(new URL("../src/utils/log/backend.ts", import.meta.url).href, {
  namedExports: { clearLogs: async () => 0, debugLog: { error() {} } },
});
mock.module(new URL("../src/utils/log/export.ts", import.meta.url).href, {
  namedExports: {
    exportLogs: async () => ({ count: 0, filename: "test.zip" }),
  },
});
mock.module(new URL("../src/shared/consts.ts", import.meta.url).href, {
  namedExports: { VERSION: "test-version" },
});
mock.module(new URL("../src/utils/log/shared.ts", import.meta.url).href, {
  namedExports: { LOG_MAX_ENTRIES: 200 },
});
const { addContextMenu, handleContextMenu } = await import(
  "../src/entrypoints/background/context-menu.ts"
);
after(() => mock.restoreAll());

type Menu = { id: string; documentUrlPatterns?: string[] };
describe("Kotoban context menus", () => {
  let menus: Menu[];
  let opened: unknown[];
  let notifications: unknown[];
  beforeEach(() => {
    menus = [];
    opened = [];
    notifications = [];
    Reflect.set(globalThis, "browser", {
      contextMenus: {
        removeAll() {},
        create: (info: Menu) => menus.push(info),
      },
      tabs: { create: (options: unknown) => opened.push(options) },
      notifications: {
        create: (options: unknown) => notifications.push(options),
      },
      runtime: { getURL: (path: string) => `extension://${path}` },
      scripting: {
        executeScript: () =>
          assert.fail("must not copy authentication storage"),
      },
    });
  });
  afterEach(() => Reflect.deleteProperty(globalThis, "browser"));

  it("includes NAILAIN and never registers the retired credential-copy menu", () => {
    addContextMenu();
    assert.ok(
      menus
        .find((menu) => menu.id === "open-in-auto-novel")
        ?.documentUrlPatterns?.includes(NAILAIN_MATCH_PATTERN),
    );
    assert.equal(
      menus.some((menu) => menu.id === "copy-auth-info"),
      false,
    );
  });

  it("opens this fork's release page", () => {
    handleContextMenu({ menuItemId: "check-release" } as never);
    assert.deepEqual(opened, [{ url: RELEASES_URL, active: true }]);
    assert.match(RELEASES_URL, /^https:\/\/github\.com\/dekkmarsvin\/addon\//);
  });

  it("uses the actual parser to open a NAILAIN page on Kotoban", () => {
    handleContextMenu(
      {
        menuItemId: "open-in-auto-novel",
        pageUrl: "https://nailain.alwaysdata.net/posts/12612524",
      } as never,
      { id: 3, index: 2 } as never,
    );
    assert.deepEqual(opened, [
      {
        url: `${BOOKS_ORIGIN}/novel/nailain/12612524`,
        active: false,
        index: 3,
        openerTabId: 3,
      },
    ]);
  });

  it("prefers the clicked link over the source page", () => {
    handleContextMenu({
      menuItemId: "open-in-auto-novel",
      linkUrl: "https://nailain.alwaysdata.net/posts/123",
      pageUrl: "https://nailain.alwaysdata.net/posts/456",
    } as never);
    assert.equal(
      (opened[0] as { url: string }).url,
      `${BOOKS_ORIGIN}/novel/nailain/123`,
    );
  });

  it("does not redirect a spoofed hostname", () => {
    handleContextMenu({
      menuItemId: "open-in-auto-novel",
      pageUrl: "https://nailain.alwaysdata.net.evil.test/posts/123",
    } as never);
    assert.deepEqual(opened, []);
    assert.equal(notifications.length, 1);
  });

  it("ignores requests for the removed credential-copy action", () => {
    handleContextMenu(
      { menuItemId: "copy-auth-info" } as never,
      { url: "http://localhost:5173" } as never,
    );
    assert.deepEqual(opened, []);
    assert.deepEqual(notifications, []);
  });
});
