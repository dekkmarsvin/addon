import tailwindcss from "@tailwindcss/vite";
import { defineConfig, UserManifest, type WxtViteConfig } from "wxt";
import {
  BOOKS_ORIGIN,
  BOOKS_MATCH_PATTERN,
  NAILAIN_MATCH_PATTERN,
  SITE_MATCH_PATTERNS,
  CHROME_PUBLIC_KEY,
  FIREFOX_ADDON_ID,
} from "./src/shared/deployment";

const IS_DEBUG = process.env.NODE_ENV === "dev";

export default defineConfig({
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-vue"],
  imports: {
    eslintrc: { enabled: true },
  },
  manifestVersion: 3,
  zip: { zipSources: false },
  manifest: ({ browser }) => {
    let userManifest: UserManifest | any = {
      name: "Kotoban 小说助手",
      homepage_url: `${BOOKS_ORIGIN}/`,
      action: {
        default_title: "轻小说机翻站用户侧爬虫插件",
      },
      web_accessible_resources: [
        {
          resources: ["inject.js"],
          matches: SITE_MATCH_PATTERNS,
        },
      ],
      permissions: [
        "tabs",
        "scripting",
        "alarms",
        "cookies",
        "storage",
        "unlimitedStorage",
        "webRequest",
        "declarativeNetRequest",
        "declarativeNetRequestWithHostAccess",
        "contextMenus",
        "notifications",
        "downloads",
      ],
      host_permissions: [
        BOOKS_MATCH_PATTERN,
        NAILAIN_MATCH_PATTERN,
        "*://*.novelia.cc/*",
        "*://*.fishhawk.top/*",
        "*://localhost/*",

        "*://httpbin.org/*",

        "*://*.baidu.com/*",
        "*://*.youdao.com/*",
        "*://*.openai.com/*",

        "*://*.amazon.co.jp/*",
        "*://kakuyomu.jp/*",
        "*://*.syosetu.com/*",
        "*://novelup.plus/*",
        "*://syosetu.org/*",
        "*://*.syosetu.org/*",
        "*://*.pixiv.net/*",
        "*://*.alphapolis.co.jp/*",
        "*://novelism.jp/*",

        "*://i.pximg.net/*",
        "*://img.syosetu.org/*",
      ],
    };

    if (browser === "chrome") {
      userManifest = {
        ...userManifest,
        key: CHROME_PUBLIC_KEY,
        externally_connectable: {
          matches: SITE_MATCH_PATTERNS,
        },
      };
    } else if (browser === "firefox") {
      userManifest = {
        ...userManifest,
        browser_specific_settings: {
          gecko: {
            id: FIREFOX_ADDON_ID,
            data_collection_permissions: {
              required: ["none"],
            },
          },
        },
      };
    } else {
      throw new Error(`不支持的浏览器类型: ${browser}`);
    }
    return userManifest;
  },
  srcDir: "src",
  webExt: {
    openDevtools: true,
    firefoxArgs: ["--devtools"],
    chromiumArgs: ["--auto-open-devtools-for-tabs", "--start-maximized"],
  },
  vite: () =>
    ({
      plugins: [tailwindcss()],
      build: {
        // minify: !IS_DEBUG,
      },
    }) as WxtViteConfig,
  autoIcons: {
    baseIconPath: "assets/icon.svg",
    sizes: [128, 48, 38, 32, 19, 16],
  },
});
