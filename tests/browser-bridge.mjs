import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

import {
  BOOKS_ORIGIN,
  CHROME_EXTENSION_ID,
  NAILAIN_ORIGIN,
} from "../src/shared/deployment.ts";

const extensionPath = fileURLToPath(
  new URL("../.output/chrome-mv3/", import.meta.url),
);
const marker = "kotoban-addon-synthetic-nailain-fixture";
const finalUrl = `${NAILAIN_ORIGIN}/posts/123456`;

async function addonCall(page, method, ...args) {
  return page.evaluate(
    async ({ method, args }) => {
      let timer;
      try {
        return await Promise.race([
          window.Addon[method](...args).then(async (value) =>
            value instanceof Response
              ? {
                  text: await value.text(),
                  status: value.status,
                  url: value.url,
                  redirected: value.redirected,
                  redirectUrl: value.headers.get(
                    "X-AutoNovelAddon-Redirect-Url",
                  ),
                }
              : value,
          ),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Addon.${method} timed out`)),
              10_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    { method, args },
  );
}

test(
  "real MV3 bridge uses only synthetic Books and NAILAIN fixtures",
  { timeout: 45_000 },
  async (t) => {
    const manifest = JSON.parse(
      await readFile(join(extensionPath, "manifest.json"), "utf8"),
    );
    const profile = await mkdtemp(join(tmpdir(), "kotoban-addon-smoke-"));
    const escapedRouting = [];
    // If extension-worker interception is unavailable, deny at the proxy too.
    // The guard never forwards a request or opens a connection to a real site.
    const networkGuard = createServer((request, response) => {
      escapedRouting.push(request.url);
      response.writeHead(502).end();
    });
    networkGuard.on("connect", (request, socket) => {
      escapedRouting.push(request.url);
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    networkGuard.listen(0, "127.0.0.1");
    await once(networkGuard, "listening");
    let context;
    t.after(async () => {
      await context?.close();
      await new Promise((resolve) => networkGuard.close(resolve));
      // Only remove the fresh profile created by this test, never an existing one.
      assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
      assert.ok(basename(profile).startsWith("kotoban-addon-smoke-"));
      await rm(profile, { recursive: true, force: true });
    });

    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      proxy: {
        server: `http://127.0.0.1:${networkGuard.address().port}`,
        bypass: "<-loopback>",
      },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    context.setDefaultTimeout(10_000);

    const blocked = [];
    const fixtureRequests = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!/^https?:$/.test(url.protocol)) return route.continue();
      fixtureRequests.push({
        url: url.href,
        worker: request.serviceWorker()?.url() ?? null,
        method: request.method(),
      });
      // No HTTP(S) request is ever continued to a live site.
      if (request.method() === "GET" && url.origin === BOOKS_ORIGIN) {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Kotoban bridge fixture</title>",
        });
      }
      if (request.method() === "GET" && url.href === finalUrl) {
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>NAILAIN fixture</title><h1>${marker}</h1>`,
        });
      }
      blocked.push(`${request.method()} ${url.href}`);
      return route.abort("blockedbyclient");
    });

    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    assert.equal(new URL(worker.url()).hostname, CHROME_EXTENSION_ID);
    const books = await context.newPage();
    await books.goto(`${BOOKS_ORIGIN}/`);
    await books.waitForFunction(
      () => document.documentElement.dataset.autoNovelAddon === "ready",
    );

    await t.test(
      "injected page reaches the real extension info and ping handlers",
      async () => {
        assert.deepEqual(await addonCall(books, "info"), {
          version: manifest.version,
          homepage_url: `${BOOKS_ORIGIN}/`,
        });
        const pong = await books.evaluate(
          (id) =>
            new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                id,
                { type: "AUTO_NOVEL_CRAWLER_PING" },
                (response) => {
                  if (chrome.runtime.lastError)
                    reject(new Error(chrome.runtime.lastError.message));
                  else resolve(response);
                },
              );
            }),
          CHROME_EXTENSION_ID,
        );
        assert.equal(pong, "pong");
      },
    );

    await t.test(
      "background fetch and Cookie access use synthetic NAILAIN data",
      async () => {
        await context.addCookies([
          {
            url: `${NAILAIN_ORIGIN}/`,
            name: "na_session",
            value: "synthetic-test-session",
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ]);
        const cookies = await addonCall(books, "cookiesStatus", {
          url: `${NAILAIN_ORIGIN}/`,
          keys: ["na_session"],
        });
        assert.equal(cookies.na_session.name, "na_session");
        assert.equal(cookies.na_session.httpOnly, true);
        assert.equal("value" in cookies.na_session, false);
        const response = await addonCall(books, "fetch", finalUrl);
        assert.equal(response.status, 200);
        assert.ok(response.text.includes(marker));
        assert.ok(
          fixtureRequests.some(
            (request) =>
              request.url === finalUrl &&
              request.worker?.startsWith(
                `chrome-extension://${CHROME_EXTENSION_ID}/`,
              ),
          ),
          "the route handler must have intercepted the real MV3 worker fetch",
        );
      },
    );

    await t.test(
      "source permission does not expose the page API at NAILAIN",
      async () => {
        const nailain = await context.newPage();
        await nailain.goto(finalUrl);
        assert.equal(
          await nailain.evaluate(() => typeof window.Addon),
          "undefined",
        );
        assert.notEqual(
          await nailain.evaluate(
            () => document.documentElement.dataset.autoNovelAddon,
          ),
          "ready",
        );
      },
    );

    assert.deepEqual(
      blocked,
      [],
      "all expected HTTP(S) requests must be fixtures",
    );
    t.diagnostic(
      `Network guard rejected ${escapedRouting.length} browser transport attempts; it never forwards traffic.`,
    );
    assert.ok(fixtureRequests.every((request) => request.method === "GET"));
  },
);
