/** Installation identity; keep browser permissions and RPC targets in sync. */
export const BOOKS_ORIGIN = "https://books.kotoban.top";
export const BOOKS_MATCH_PATTERN = `${BOOKS_ORIGIN}/*`;
export const NAILAIN_ORIGIN = "https://nailain.alwaysdata.net";
export const NAILAIN_MATCH_PATTERN = `${NAILAIN_ORIGIN}/*`;
export const REPOSITORY_URL = "https://github.com/dekkmarsvin/addon";
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
export const FIREFOX_ADDON_ID = "addon@books.kotoban.top";
export const SITE_MATCH_PATTERNS = [
  "http://localhost/*",
  "https://*.novelia.cc/*",
  "https://*.fishhawk.top/*",
  BOOKS_MATCH_PATTERN,
];

/** Must match content-script/external-message admission, not source hosts. */
export function isTrustedSiteUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.hostname === "localhost" && url.protocol === "http:") return true;
    if (url.protocol !== "https:") return false;
    if (url.origin === BOOKS_ORIGIN) return true;
    return ["novelia.cc", "fishhawk.top"].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export function isTrustedMessageSender(
  sender: { id?: string; url?: string },
  extension: { id: string; rootUrl: string },
): boolean {
  return (
    isTrustedSiteUrl(sender.url) ||
    (sender.id === extension.id && !!sender.url?.startsWith(extension.rootUrl))
  );
}

// A separate stable unpacked-extension identity, independent of upstream.
// This is a public key; no signing/private key is stored in the repository.
export const CHROME_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAys5Lf/uxT1TR//0nC+ZdIzawQ7qrNPJ21Ol3m03SlJUJfrLlWtA7wzLF07HlCfOuixlk6cjeNQmTPkZlbMpTZ07bPYFlCFqqA4LlmEPqgu8aXu96aXcjPtJxvNBO3xmcADVv/1oQY8cJBmV8cDk2VbpqDgFZVcB+DyT0QHIJBXl2AkLctldc09MoNhTwddiygev9uirWDBUMGoODOqJPHAngiPqb/RM+Zh52fyVup83h0+doWJDbSPDJ64L2UO4Rx1Ga7SwdIX5msk5kJYGgjwxg1zDLZns7IsD01G+XhgO15JpVtDp/Kmw1LWDJ1G+C3kQ5K4jULuKBWuBMP3sznQIDAQAB";
export const CHROME_EXTENSION_ID = "cipknbnhmhaddapcipjncdaaibgcidgi";
