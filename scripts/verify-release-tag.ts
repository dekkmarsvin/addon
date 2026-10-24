import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function releaseTag({
  version,
  eventName,
  ref = "",
  inputTag = "",
}: {
  version: string;
  eventName: string;
  ref?: string;
  inputTag?: string;
}) {
  let tag;
  if (eventName === "push" && ref.startsWith("refs/tags/")) {
    tag = ref.slice("refs/tags/".length);
  } else if (eventName === "workflow_dispatch") {
    tag = inputTag;
  } else {
    throw new Error(
      "Releases require a version tag or explicit release dispatch.",
    );
  }
  assert.match(
    version,
    /^\d+\.\d+\.\d+$/,
    "Package must use a browser-compatible release version",
  );
  assert.equal(
    tag,
    "v" + version,
    "Release tag must exactly match package.json version",
  );
  return tag;
}

export function assertTagCommit(head: string, tagCommit: string) {
  assert.match(head, /^[a-f0-9]{40}$/i, "Missing source commit");
  assert.equal(
    tagCommit,
    head,
    "Release tag must point to the checked-out source commit",
  );
}

function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tag = releaseTag({
    version: pkg.version,
    eventName: process.env.GITHUB_EVENT_NAME || "",
    ref: process.env.GITHUB_REF || "",
    inputTag: process.env.RELEASE_TAG || "",
  });
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "--verify", "HEAD");
  assertTagCommit(
    commit,
    git("rev-parse", "--verify", "refs/tags/" + tag + "^{commit}"),
  );
  execFileSync("git", ["diff", "--quiet", "HEAD", "--"]);
  assert.equal(
    git("status", "--porcelain", "--untracked-files=normal"),
    "",
    "Release source must be clean and fully committed",
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      "tag=" + tag + "\nversion=" + pkg.version + "\ncommit=" + commit + "\n",
    );
  }
  console.log("Verified " + tag + " at " + commit);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
