import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import JSZip from "jszip";
import { assertTagCommit, releaseTag } from "../scripts/verify-release-tag";
import {
  artifactNames,
  assertSourcePath,
  assertZipMatchesBuild,
  chromeId,
  releaseRepository,
  safeArchivePath,
  validateBundle,
  validateManifest,
} from "../scripts/release-artifacts";
import {
  BOOKS_ORIGIN,
  BOOKS_MATCH_PATTERN,
  NAILAIN_MATCH_PATTERN,
  CHROME_PUBLIC_KEY,
  CHROME_EXTENSION_ID,
  FIREFOX_ADDON_ID,
  REPOSITORY_URL,
  SITE_MATCH_PATTERNS,
} from "../src/shared/deployment";

const version = "1.9.4";
function manifest(browser: "chrome" | "firefox" = "chrome") {
  return {
    manifest_version: 3,
    name: "Kotoban 小说助手",
    version,
    homepage_url: BOOKS_ORIGIN + "/",
    host_permissions: [BOOKS_MATCH_PATTERN, NAILAIN_MATCH_PATTERN],
    content_scripts: [
      { matches: [...SITE_MATCH_PATTERNS], js: ["content.js"] },
    ],
    web_accessible_resources: [
      { resources: ["inject.js"], matches: [...SITE_MATCH_PATTERNS] },
    ],
    background:
      browser === "chrome"
        ? { service_worker: "background.js" }
        : { scripts: ["background.js"] },
    ...(browser === "chrome"
      ? {
          key: CHROME_PUBLIC_KEY,
          externally_connectable: { matches: [...SITE_MATCH_PATTERNS] },
        }
      : { browser_specific_settings: { gecko: { id: FIREFOX_ADDON_ID } } }),
  };
}
async function bundle(
  browser: "chrome" | "firefox" = "chrome",
  inject = CHROME_EXTENSION_ID,
) {
  return new JSZip()
    .file("manifest.json", JSON.stringify(manifest(browser)))
    .file("background.js", "export {};")
    .file("content.js", "export {};")
    .file("inject.js", "const extensionId=" + JSON.stringify(inject) + ";")
    .generateAsync({ type: "nodebuffer" });
}

test("only exact package-version tags can release through tag push or explicit dispatch", () => {
  assert.equal(
    releaseTag({ version, eventName: "push", ref: "refs/tags/v1.9.4" }),
    "v1.9.4",
  );
  assert.equal(
    releaseTag({ version, eventName: "workflow_dispatch", inputTag: "v1.9.4" }),
    "v1.9.4",
  );
  for (const ref of [
    "refs/heads/main",
    "refs/tags/nightly",
    "refs/tags/v1.9.3",
    "refs/tags/v1.9.40",
  ]) {
    assert.throws(() => releaseTag({ version, eventName: "push", ref }));
  }
  for (const inputTag of [
    "",
    "main",
    "nightly",
    "v1.9.3",
    "v1.9.4\nunexpected",
  ]) {
    assert.throws(() =>
      releaseTag({ version, eventName: "workflow_dispatch", inputTag }),
    );
  }
  assert.throws(() =>
    releaseTag({ version, eventName: "pull_request", ref: "refs/tags/v1.9.4" }),
  );
  assertTagCommit("a".repeat(40), "a".repeat(40));
  assert.throws(() => assertTagCommit("a".repeat(40), "b".repeat(40)));
});

test("release identity derives Chromium ID from its key and uses the fork repository", () => {
  assert.equal(chromeId(CHROME_PUBLIC_KEY), CHROME_EXTENSION_ID);
  assert.equal(releaseRepository("dekkmarsvin/addon"), REPOSITORY_URL);
  assert.throws(() => releaseRepository("auto-novel/addon"));
  assert.throws(() => chromeId("invalid-public-key"));
  assert.deepEqual(artifactNames(version), {
    chrome: "kotoban-addon-1.9.4-chromium.zip",
    firefox: "kotoban-addon-1.9.4-firefox-temporary.zip",
    sources: "kotoban-addon-1.9.4-sources.zip",
  });
});

test("manifests reject stale versions, foreign identities and expanded site scopes", () => {
  validateManifest(manifest(), "chrome", version);
  validateManifest(manifest("firefox"), "firefox", version);
  const invalid = [
    { ...manifest(), version: "1.9.3" },
    { ...manifest(), manifest_version: 2 },
    { ...manifest(), key: "" },
    {
      ...manifest(),
      host_permissions: [...manifest().host_permissions, "<all_urls>"],
    },
    {
      ...manifest(),
      host_permissions: ["*://*.kotoban.top/*", NAILAIN_MATCH_PATTERN],
    },
    {
      ...manifest(),
      host_permissions: [BOOKS_MATCH_PATTERN, "*://*.alwaysdata.net/*"],
    },
    { ...manifest(), externally_connectable: { matches: ["<all_urls>"] } },
    {
      ...manifest(),
      web_accessible_resources: [
        { resources: ["inject.js"], matches: ["<all_urls>"] },
      ],
    },
    { ...manifest(), update_url: REPOSITORY_URL + "/update.json" },
  ];
  for (const value of invalid)
    assert.throws(() => validateManifest(value, "chrome", version));
  const firefox = manifest("firefox");
  assert.throws(() =>
    validateManifest(
      {
        ...firefox,
        browser_specific_settings: { gecko: { id: "addon2@n.novelia.cc" } },
      },
      "firefox",
      version,
    ),
  );
  assert.throws(() =>
    validateManifest(
      {
        ...firefox,
        browser_specific_settings: {
          gecko: {
            id: FIREFOX_ADDON_ID,
            update_url: REPOSITORY_URL + "/update.json",
          },
        },
      },
      "firefox",
      version,
    ),
  );
});

test("ZIP validation catches browser swaps, stale client IDs and missing runtime files", async () => {
  await validateBundle(await bundle(), "chrome", version);
  await validateBundle(await bundle("firefox"), "firefox", version);
  await assert.rejects(
    validateBundle(await bundle("firefox"), "chrome", version),
  );
  await assert.rejects(
    validateBundle(await bundle("chrome", "a".repeat(32)), "chrome", version),
    /client extension ID/,
  );
  const missing = await JSZip.loadAsync(await bundle());
  missing.remove("background.js");
  await assert.rejects(
    validateBundle(
      await missing.generateAsync({ type: "nodebuffer" }),
      "chrome",
      version,
    ),
    /Missing background/,
  );
  const unsafe = await JSZip.loadAsync(await bundle());
  unsafe.file("../outside.js", "oops");
  await assert.rejects(
    validateBundle(
      await unsafe.generateAsync({ type: "nodebuffer" }),
      "chrome",
      version,
    ),
    /Unsafe archive/,
  );
});

test("release ZIP files and bytes must exactly match the built directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kotoban-addon-zip-"));
  try {
    const zip = new JSZip()
      .file("manifest.json", "{}")
      .file("assets/entry.js", "actual");
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "manifest.json"), "{}");
    await writeFile(join(directory, "assets/entry.js"), "actual");
    await assertZipMatchesBuild(zip, directory);
    await writeFile(join(directory, "assets/entry.js"), "tampered");
    await assert.rejects(assertZipMatchesBuild(zip, directory), /bytes differ/);
    await writeFile(join(directory, "extra.js"), "stale");
    await assert.rejects(
      assertZipMatchesBuild(zip, directory),
      /file lists differ/,
    );
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("kotoban-addon-zip-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("source archives refuse private files and escaping paths", () => {
  for (const name of ["../escape", "/absolute", "C:/absolute", "dir\\escape"])
    assert.throws(() => safeArchivePath(name));
  for (const name of [
    ".env",
    ".env.local",
    "nested/.env.production",
    "signing.pem",
    "nested/private.key",
    "release-assets/old.zip",
    "node_modules/package/index.js",
  ])
    assert.throws(() => assertSourcePath(name));
  assertSourcePath("src/shared/deployment.ts");
  assertSourcePath(".github/workflows/ci.yml");
});
