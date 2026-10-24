# Kotoban Addon fork

This fork follows [auto-novel/addon](https://github.com/auto-novel/addon), starting
from upstream `90454c2e19004a9fb0455d4ba49b5b7c2e1dedd8`. Keep upstream copyright,
author attribution and GPL-3.0 licensing intact.

## Maintained differences

- Production book origin is `https://books.kotoban.top`; release repository is
  `https://github.com/dekkmarsvin/addon`.
- NAILAIN source origin is `https://nailain.alwaysdata.net`. Preserve its source
  permissions and numeric `/posts/{id}` redirect mapping.
- Keep manifest permissions, injected-page matches, web-accessible resources,
  external-message admission and runtime extension ID consistent with the shared
  deployment constants. Grant source access without exposing the page API to
  arbitrary third-party pages.
- Chromium uses the fork's own stable public key/ID
  `cipknbnhmhaddapcipjncdaaibgcidgi`; Firefox ID is `addon@books.kotoban.top`.
  Never copy upstream's extension identity or commit a private/signing key.
- The legacy production-to-localhost authentication-transfer feature is retired.
  Do not restore copying production sessions into development sites.
- Preserve narrow sender/target admission checks, RPC behavior and feature
  compatibility. Prefer upstream fixes over a parallel crawler/RPC framework.
- Describe Cookie access, third-party requests and persisted logs accurately.
  No real credentials, cookies, API keys or external mutations belong in tests.

## Release and verification

- Pin the package manager and retain frozen lockfile installs. Run typecheck,
  normal build, focused regressions and package/manifest validation before
  releasing. Run the Chromium bridge smoke in a fresh temporary profile with
  fixture-only network routing; do not use a person's existing browser profile.
- Version, manifest identity, archive names, release metadata and checksums must
  agree. Record the exact source commit and evaluated upstream baseline.
- Publish fork assets only to this fork's release URL. Preserve a source archive
  and GPL license alongside packaged code.
- Chrome/Edge delivery is an unpacked-extension zip. The current Firefox
  delivery is an unsigned temporary-load zip. Do not generate an automatic
  update feed, advertise a permanently installable XPI, or suggest disabling
  signature verification. A signed Firefox release needs a separately authorized
  Mozilla signing flow and secrets kept outside the repository.
- After pushing, inspect GitHub Actions for the exact pushed SHA; wait for
  queued/running required checks and report any failure or unavailable CI.
- For each upstream sync, record the evaluated range and accepted/rejected
  changes, preserve the installation identities and bounded security adaptations,
  then verify both browser manifests. No service deployment follows implicitly
  from an Addon release.
