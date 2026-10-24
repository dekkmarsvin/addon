import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { test } from "node:test";
import {
  BOOKS_ORIGIN,
  CHROME_EXTENSION_ID,
  CHROME_PUBLIC_KEY,
  FIREFOX_ADDON_ID,
  NAILAIN_ORIGIN,
  isTrustedMessageSender,
  isTrustedSiteUrl,
} from "../src/shared/deployment.ts";

test("the fork's valid public key produces its own stable Chrome RPC identity", () => {
  const key = Buffer.from(CHROME_PUBLIC_KEY, "base64");
  assert.equal(
    createPublicKey({ key, format: "der", type: "spki" }).asymmetricKeyType,
    "rsa",
  );
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const derived = [...hash]
    .map((char) => String.fromCharCode(97 + parseInt(char, 16)))
    .join("");
  assert.equal(derived, CHROME_EXTENSION_ID);
  assert.notEqual(derived, "kenigjdcpndlkomhegjcepokcgikpdki");
  assert.equal(FIREFOX_ADDON_ID, "addon@books.kotoban.top");
});

test("production and existing supported caller sites remain admitted", () => {
  for (const url of [
    `${BOOKS_ORIGIN}/workspace/gpt-pipeline`,
    "https://n.novelia.cc/",
    "https://books.fishhawk.top/",
    "http://localhost:5173/",
  ])
    assert.equal(isTrustedSiteUrl(url), true, url);
});

test("new source permissions do not turn source pages or lookalikes into privileged callers", () => {
  for (const url of [
    `${NAILAIN_ORIGIN}/posts/12612524`,
    "http://books.kotoban.top/",
    "https://books.kotoban.top.evil.example/",
    "https://evil.books.kotoban.top/",
    "https://books.kotoban.top:8443/",
    "https://books.kotoban.top@evil.example/",
    "https://user:password@books.kotoban.top/",
    "https://novelia.cc.evil.example/",
    "https://example.com/",
    "file:///localhost/",
    "not a URL",
    undefined,
  ])
    assert.equal(isTrustedSiteUrl(url), false, String(url));
});

test("own options pages require both the runtime ID and extension URL", () => {
  const extension = {
    id: CHROME_EXTENSION_ID,
    rootUrl: `chrome-extension://${CHROME_EXTENSION_ID}/`,
  };
  assert.equal(
    isTrustedMessageSender(
      { id: extension.id, url: extension.rootUrl + "options.html" },
      extension,
    ),
    true,
  );
  assert.equal(
    isTrustedMessageSender(
      { id: "other-addon", url: extension.rootUrl + "options.html" },
      extension,
    ),
    false,
  );
  assert.equal(
    isTrustedMessageSender(
      { id: extension.id, url: "https://example.com/" },
      extension,
    ),
    false,
  );
  assert.equal(
    isTrustedMessageSender(
      { url: extension.rootUrl + "options.html" },
      extension,
    ),
    false,
  );
  assert.equal(
    isTrustedMessageSender({ url: BOOKS_ORIGIN + "/" }, extension),
    true,
  );
});
