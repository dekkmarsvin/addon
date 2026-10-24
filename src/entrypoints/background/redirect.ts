import { BOOKS_ORIGIN, NAILAIN_ORIGIN } from "../../shared/deployment";

const NAILAIN_HOST = new URL(NAILAIN_ORIGIN).hostname;

export type RedirectionResult = {
  providerId: string;
  novelId: string;
  url: string;
};

export function getRedirectionResult(input: string): RedirectionResult | null {
  // Do not let URL's forgiving normalization turn malformed input into a match.
  if (
    !/^https?:\/\//i.test(input) ||
    /[\s\\]/.test(input) ||
    Array.from(input).some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;

  let providerId: string;
  let novelId: string | undefined;
  const path = url.pathname;
  switch (url.hostname) {
    case "kakuyomu.jp":
      providerId = "kakuyomu";
      novelId = /^\/works\/(\d+)(?:\/episodes\/\d+)?\/?$/.exec(path)?.[1];
      break;
    case "ncode.syosetu.com":
    case "novel18.syosetu.com":
      providerId = "syosetu";
      novelId = /^\/(n\d+[a-z]+)(?:\/\d+)?\/?$/i.exec(path)?.[1].toLowerCase();
      break;
    case "novelup.plus":
      providerId = "novelup";
      novelId = /^\/story\/(\d+)(?:\/\d+)?\/?$/.exec(path)?.[1];
      break;
    case "syosetu.org":
    case "www.syosetu.org":
    case "h.syosetu.org":
      providerId = "hameln";
      novelId = /^\/novel\/(\d+)(?:\/\d+\.html)?\/?$/.exec(path)?.[1];
      break;
    case "pixiv.net":
    case "www.pixiv.net": {
      providerId = "pixiv";
      novelId = /^\/novel\/series\/(\d+)\/?$/.exec(path)?.[1];
      if (path === "/novel/show.php") {
        const ids = url.searchParams.getAll("id");
        if (ids.length === 1 && /^\d+$/.test(ids[0])) novelId = `s${ids[0]}`;
      }
      break;
    }
    case "alphapolis.co.jp":
    case "www.alphapolis.co.jp": {
      providerId = "alphapolis";
      const match = /^\/novel\/(\d+)\/(\d+)(?:\/episode\/\d+)?\/?$/.exec(path);
      if (match) novelId = `${match[1]}-${match[2]}`;
      break;
    }
    case "novelism.jp":
      providerId = "novelism";
      novelId = /^\/novel\/([a-z\d_-]+)(?:\/article\/[a-z\d_-]+)?\/?$/i.exec(
        path,
      )?.[1];
      break;
    case NAILAIN_HOST:
      providerId = "nailain";
      novelId = /^\/posts\/(\d+)\/?$/.exec(path)?.[1];
      break;
    default:
      return null;
  }
  return novelId === undefined
    ? null
    : {
        providerId,
        novelId,
        url: `${BOOKS_ORIGIN}/novel/${providerId}/${novelId}`,
      };
}

export function redirectToAutoNovel() {
  browser.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url ?? "";

    const redir = getRedirectionResult(tabUrl);
    if (redir == null) return;

    const { url } = redir;
    browser.tabs.create({
      url,
      active: true,
    });
  });
}
