import { ClientCmd, CookieStatus, SerializableResponse } from "@/rpc/types";
import { debugLog } from "@/utils/log/backend";
import { cookie2SetDetail, newError } from "@/utils/tools";
import setCookie from "set-cookie-parser";

export async function cookies_get(
  domain: string,
): Promise<Browser.cookies.Cookie[]> {
  const cookies = await browser.cookies.getAll({ domain });
  debugLog("cookies_get", domain, { count: cookies.length });
  return cookies;
}

export async function cookies_set(
  cookies: Browser.cookies.Cookie[],
): Promise<void> {
  const promises = cookies.map((cookie) => {
    const setDetail = cookie2SetDetail(cookie);
    try {
      return browser.cookies.set(setDetail);
    } catch (e) {
      debugLog.warn(
        `Failed to restore cookie: ${setDetail.name} for domain ${setDetail.domain}`,
        e,
      );
    }
  });
  await Promise.all(promises);
}

export async function cookies_getStr(url: string): Promise<string> {
  const cookies = await cookies_get(url);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export async function cookies_status(
  params: Parameters<ClientCmd["cookies.status"]>[0],
): Promise<Record<string, CookieStatus | null>> {
  const { url, domain, partitionKey, keys } = params;

  const cookiesGetAllSafeParams = { url, domain };
  let cookies: Browser.cookies.Cookie[];
  try {
    cookies = await browser.cookies.getAll({
      ...cookiesGetAllSafeParams,
      ...(partitionKey ? { partitionKey } : {}),
    });
  } catch (e) {
    // Use safe version of cookiesGetAllParams.
    cookies = await browser.cookies.getAll(cookiesGetAllSafeParams);
  }

  const ret: Awaited<ReturnType<ClientCmd["cookies.status"]>> = {};
  if (keys === "*") {
    for (const cookie of cookies) {
      const name = cookie.name;
      const { value, ...remaining } = cookie;
      ret[name] = { ...remaining };
    }
  } else {
    for (const key of keys) {
      ret[key] = null;
      const cookie = cookies.find((c) => c.name === key);
      if (cookie) {
        const { value, ...remaining } = cookie;
        ret[key] = { ...remaining };
      }
    }
  }
  return ret;
}

export async function cookies_patch(
  params: Parameters<ClientCmd["cookies.patch"]>[0],
): Promise<void> {
  const { url, patches } = params;
  const cookies = await browser.cookies.getAll({ url });
  const promises = Object.entries(patches).map(([key, patch]) => {
    const existing = cookies.find((c) => c.name === key);

    // null patch -> delete the cookie
    if (patch === null) {
      if (!existing) return [];
      debugLog(`Deleting cookie: ${key} from ${url}`);
      return browser.cookies.remove({ url, name: key });
    }

    if (existing) {
      // Merge existing cookie with patch
      debugLog(`Merging cookie: ${key} for ${url}`);
      const merged: Browser.cookies.Cookie = { ...existing, ...patch };
      return browser.cookies.set(cookie2SetDetail(merged));
    }

    // Create new cookie
    debugLog(`Creating new cookie: ${key} for ${url}`);
    const domain = patch.domain ?? new URL(url).hostname;
    const setDetail: Browser.cookies.SetDetails = {
      url,
      domain,
      value: patch.value ?? "",
      secure: true,
      sameSite: "no_restriction",
      ...patch,
    };
    return browser.cookies.set(setDetail);
  });
  await Promise.all(promises);
}

export async function cookies_setFromSerResp(
  response: SerializableResponse,
): Promise<void> {
  const setCookieStrings = Array.from(response.headers)
    .filter((h) => h[0].toLowerCase() === "set-cookie")
    .map((h) => h[1]);

  if (setCookieStrings.length === 0) {
    return;
  }

  const parsedCookies = setCookie.parse(setCookieStrings);
  const setPromises = parsedCookies.map((cookie) => {
    const setDetail: Browser.cookies.SetDetails = {
      ...cookie,
      url: response.url,
      sameSite: cookie.sameSite as Browser.cookies.SameSiteStatus,
    };

    if (cookie.expires) {
      setDetail.expirationDate = cookie.expires.getTime() / 1000;
    } else if (cookie.maxAge) {
      setDetail.expirationDate = Date.now() / 1000 + cookie.maxAge;
    }
    return browser.cookies.set(setDetail);
  });

  try {
    await Promise.all(setPromises);
    console.log(
      `Successfully set ${setPromises.length} cookies for ${response.url}`,
    );
  } catch (error) {
    throw newError(`Failed to set one or more cookies: ${error}`);
  }
}
