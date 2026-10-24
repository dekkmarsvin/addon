import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  BOOKS_ORIGIN,
  BOOKS_MATCH_PATTERN,
  NAILAIN_MATCH_PATTERN,
  CHROME_PUBLIC_KEY,
  CHROME_EXTENSION_ID,
  FIREFOX_ADDON_ID,
  RELEASES_URL,
  REPOSITORY_URL,
  SITE_MATCH_PATTERNS,
} from "../src/shared/deployment";

type Browser = "chrome" | "firefox";
type Manifest = {
  manifest_version: number;
  name: string;
  version: string;
  homepage_url: string;
  key?: string;
  update_url?: string;
  host_permissions: string[];
  content_scripts: { matches: string[]; js: string[] }[];
  externally_connectable?: { matches: string[] };
  web_accessible_resources: { resources: string[]; matches: string[] }[];
  background: { service_worker?: string; scripts?: string[] };
  browser_specific_settings?: {
    gecko?: { id?: string; update_url?: string };
  };
};

export const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const sorted = (values: string[]) => [...values].sort();

export function chromeId(publicKey: string) {
  const der = Buffer.from(publicKey, "base64");
  createPublicKey({ key: der, format: "der", type: "spki" });
  return sha256(der)
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + Number.parseInt(digit, 16)),
    );
}

export function validateManifest(
  manifest: Manifest,
  browser: Browser,
  version: string,
) {
  assert.equal(manifest.manifest_version, 3, "Release must be MV3");
  assert.equal(manifest.version, version, "Manifest/package versions differ");
  assert.equal(manifest.name, "Kotoban 小说助手");
  assert.equal(manifest.homepage_url.replace(/\/$/, ""), BOOKS_ORIGIN);
  assert.equal(
    manifest.update_url,
    undefined,
    "No unsigned auto-update promise",
  );
  assert.ok(manifest.host_permissions.includes(BOOKS_MATCH_PATTERN));
  assert.ok(manifest.host_permissions.includes(NAILAIN_MATCH_PATTERN));
  assert.deepEqual(
    manifest.host_permissions.filter((match) => match.includes("kotoban.top")),
    [BOOKS_MATCH_PATTERN],
    "Kotoban access must be exact HTTPS Books origin",
  );
  assert.deepEqual(
    manifest.host_permissions.filter((match) =>
      match.includes("alwaysdata.net"),
    ),
    [NAILAIN_MATCH_PATTERN],
    "NAILAIN access must use its exact HTTPS origin",
  );
  assert.deepEqual(
    sorted(manifest.content_scripts.flatMap((script) => script.matches)),
    sorted(SITE_MATCH_PATTERNS),
    "Content-script scope differs from the site bridge",
  );
  const injectable = manifest.web_accessible_resources.find((entry) =>
    entry.resources.includes("inject.js"),
  );
  assert.ok(injectable, "Missing page bridge resource");
  assert.deepEqual(sorted(injectable.matches), sorted(SITE_MATCH_PATTERNS));
  assert.equal(chromeId(CHROME_PUBLIC_KEY), CHROME_EXTENSION_ID);
  if (browser === "chrome") {
    assert.equal(manifest.key, CHROME_PUBLIC_KEY, "Wrong Chromium public key");
    assert.equal(chromeId(manifest.key), CHROME_EXTENSION_ID);
    assert.deepEqual(
      sorted(manifest.externally_connectable?.matches ?? []),
      sorted(SITE_MATCH_PATTERNS),
    );
  } else {
    const gecko = manifest.browser_specific_settings?.gecko;
    assert.equal(gecko?.id, FIREFOX_ADDON_ID, "Wrong Firefox fork identity");
    assert.equal(
      gecko?.update_url,
      undefined,
      "Firefox ZIP is unsigned/temporary",
    );
  }
}

export function safeArchivePath(path: string) {
  assert.ok(
    path &&
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.split("/").includes("..") &&
      !/^[a-z]:/i.test(path),
    "Unsafe archive path: " + path,
  );
}

export function assertSourcePath(path: string) {
  safeArchivePath(path);
  assert.ok(
    !/(^|\/)(\.env($|\.)|node_modules\/|release-assets\/)|\.(pem|key)$/i.test(
      path,
    ),
    "Private/generated file in sources: " + path,
  );
}

export async function validateBundle(
  bytes: Uint8Array,
  browser: Browser,
  version: string,
) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  for (const [name, entry] of Object.entries(zip.files)) {
    safeArchivePath(name);
    if ("unsafeOriginalName" in entry) {
      safeArchivePath(String(entry.unsafeOriginalName));
    }
  }
  const manifestFile = zip.file("manifest.json");
  assert.ok(manifestFile, "ZIP must have manifest.json at its root");
  const manifest: Manifest = JSON.parse(await manifestFile.async("string"));
  validateManifest(manifest, browser, version);
  assert.ok(zip.file("inject.js"), "Missing built page bridge");
  const runtimeFiles = [
    ...(manifest.background.service_worker
      ? [manifest.background.service_worker]
      : (manifest.background.scripts ?? [])),
    ...manifest.content_scripts.flatMap((script) => script.js),
  ];
  assert.ok(runtimeFiles.length > 0, "Missing runtime entrypoints");
  for (const name of runtimeFiles) assert.ok(zip.file(name), "Missing " + name);
  if (browser === "chrome") {
    assert.ok(
      (await zip.file("inject.js")!.async("string")).includes(
        CHROME_EXTENSION_ID,
      ),
      "Built client extension ID differs from the Chromium key",
    );
  }
  return zip;
}

async function filesUnder(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const name = prefix + entry.name;
      assert.ok(!entry.isSymbolicLink(), "Symlinks are not release files");
      return entry.isDirectory() ? filesUnder(root, name + "/") : [name];
    }),
  );
  return nested.flat().sort();
}

export async function assertZipMatchesBuild(zip: JSZip, directory: string) {
  const names = Object.entries(zip.files)
    .filter(([, entry]) => !entry.dir)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(
    names,
    await filesUnder(directory),
    "ZIP/build file lists differ",
  );
  for (const name of names) {
    assert.deepEqual(
      await zip.file(name)!.async("nodebuffer"),
      await readFile(join(directory, name)),
      "ZIP/build bytes differ for " + name,
    );
  }
}

export function releaseRepository(repository = process.env.GITHUB_REPOSITORY) {
  const url = repository ? "https://github.com/" + repository : REPOSITORY_URL;
  assert.equal(
    url.toLowerCase(),
    REPOSITORY_URL.toLowerCase(),
    "Wrong fork repository",
  );
  assert.equal(RELEASES_URL, REPOSITORY_URL + "/releases");
  return url;
}

export function artifactNames(version: string) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const prefix = "kotoban-addon-" + version;
  return {
    chrome: prefix + "-chromium.zip",
    firefox: prefix + "-firefox-temporary.zip",
    sources: prefix + "-sources.zip",
  };
}

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function sourceArchive(version: string) {
  const zip = new JSZip();
  const names = new Set(
    git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean),
  );
  const date = new Date(git("show", "-s", "--format=%cI", "HEAD"));
  for (const name of [...names].sort()) {
    assertSourcePath(name);
    assert.ok(
      (await lstat(name)).isFile(),
      "Source must be a regular file: " + name,
    );
    zip.file(name, await readFile(name), { date });
  }
  for (const required of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "wxt.config.ts",
    "src/shared/deployment.ts",
    ".github/workflows/ci.yml",
    ".github/workflows/cd-addon.yml",
  ]) {
    assert.ok(zip.file(required), "Missing rebuild source: " + required);
  }
  const pkg = JSON.parse(await zip.file("package.json")!.async("string"));
  assert.equal(pkg.version, version);
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

async function prepareArtifacts() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const names = artifactNames(pkg.version);
  const repo = releaseRepository();
  const prepared = [];
  for (const browser of ["chrome", "firefox"] as const) {
    const bytes = await readFile(
      ".output/addon-" + pkg.version + "-" + browser + ".zip",
    );
    const zip = await validateBundle(bytes, browser, pkg.version);
    await assertZipMatchesBuild(zip, ".output/" + browser + "-mv3");
    prepared.push({
      name: names[browser],
      bytes,
      installation:
        browser === "chrome"
          ? "unpacked-chrome-or-edge"
          : "firefox-unsigned-temporary",
    });
  }
  prepared.push({
    name: names.sources,
    bytes: await sourceArchive(pkg.version),
    installation: "source",
  });
  const metadata = {
    version: pkg.version,
    tag: "v" + pkg.version,
    repository: repo,
    commit: git("rev-parse", "HEAD"),
    dirty: Boolean(git("status", "--porcelain", "--untracked-files=normal")),
    chromeExtensionId: CHROME_EXTENSION_ID,
    firefoxAddonId: FIREFOX_ADDON_ID,
    firefoxSigned: false,
    automaticUpdates: false,
    artifacts: prepared.map(({ name, bytes, installation }) => ({
      name,
      sha256: sha256(bytes),
      bytes: bytes.length,
      installation,
      url: repo + "/releases/download/v" + pkg.version + "/" + name,
    })),
  };
  const manifestBytes = Buffer.from(JSON.stringify(metadata, null, 2) + "\n");
  const checksums =
    [
      ...prepared.map(({ name, bytes }) => [name, bytes] as const),
      ["release-manifest.json", manifestBytes] as const,
    ]
      .map(([name, bytes]) => sha256(bytes) + "  " + name)
      .join("\n") + "\n";
  await mkdir("release-assets", { recursive: true });
  for (const item of prepared)
    await writeFile(join("release-assets", item.name), item.bytes);
  await writeFile("release-assets/release-manifest.json", manifestBytes);
  await writeFile("release-assets/SHA256SUMS", checksums);
}

async function checkArtifacts() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const names = artifactNames(pkg.version);
  const expected = [
    ...Object.values(names),
    "release-manifest.json",
    "SHA256SUMS",
  ].sort();
  assert.deepEqual(
    (await readdir("release-assets")).sort(),
    expected,
    "Unexpected release assets",
  );
  const metadata = JSON.parse(
    await readFile("release-assets/release-manifest.json", "utf8"),
  );
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.tag, "v" + pkg.version);
  assert.equal(metadata.commit, git("rev-parse", "HEAD"));
  assert.equal(metadata.repository, releaseRepository());
  assert.equal(metadata.chromeExtensionId, CHROME_EXTENSION_ID);
  assert.equal(metadata.firefoxAddonId, FIREFOX_ADDON_ID);
  assert.equal(metadata.firefoxSigned, false);
  assert.equal(metadata.automaticUpdates, false);
  if (
    process.env.GITHUB_ACTIONS === "true" &&
    (process.env.GITHUB_REF?.startsWith("refs/tags/") ||
      process.env.RELEASE_TAG)
  ) {
    assert.equal(
      metadata.dirty,
      false,
      "Published sources must match a clean commit",
    );
  }
  const checksumLines = (await readFile("release-assets/SHA256SUMS", "utf8"))
    .trim()
    .split("\n");
  assert.equal(checksumLines.length, expected.length - 1);
  const checkedNames = [];
  for (const line of checksumLines) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9.-]+)$/.exec(line);
    assert.ok(match, "Malformed checksum");
    assert.ok(expected.includes(match[2]) && match[2] !== "SHA256SUMS");
    checkedNames.push(match[2]);
    assert.equal(
      sha256(await readFile(join("release-assets", match[2]))),
      match[1],
    );
  }
  assert.deepEqual(
    checkedNames.sort(),
    expected.filter((name) => name !== "SHA256SUMS"),
  );
  const sources = await JSZip.loadAsync(
    await readFile(join("release-assets", names.sources)),
    { checkCRC32: true },
  );
  for (const [name, entry] of Object.entries(sources.files)) {
    if (!entry.dir) assertSourcePath(name);
  }
  assert.equal(
    JSON.parse(await sources.file("package.json")!.async("string")).version,
    pkg.version,
  );
  assert.equal(
    await sources.file("src/shared/deployment.ts")!.async("string"),
    await readFile("src/shared/deployment.ts", "utf8"),
    "Source archive identity differs from the build",
  );
  for (const browser of ["chrome", "firefox"] as const) {
    const bytes = await readFile(join("release-assets", names[browser]));
    const zip = await validateBundle(bytes, browser, pkg.version);
    await assertZipMatchesBuild(zip, ".output/" + browser + "-mv3");
  }
  assert.deepEqual(
    metadata.artifacts
      .map((artifact: { name: string }) => artifact.name)
      .sort(),
    Object.values(names).sort(),
  );
  for (const artifact of metadata.artifacts) {
    const bytes = await readFile(join("release-assets", artifact.name));
    assert.equal(artifact.sha256, sha256(bytes));
    assert.equal(artifact.bytes, bytes.length);
    assert.equal(
      artifact.url,
      releaseRepository() +
        "/releases/download/v" +
        pkg.version +
        "/" +
        artifact.name,
    );
  }
  console.log(
    "Verified fork identity, MV3 ZIP/build bytes, sources and release checksums.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv.includes("--check")) await prepareArtifacts();
    await checkArtifacts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
