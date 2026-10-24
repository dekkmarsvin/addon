import { clearLogs, debugLog } from "@/utils/log/backend";
import { exportLogs } from "@/utils/log/export";

import { getRedirectionResult } from "./redirect";
import { VERSION } from "@/shared/consts";
import { LOG_MAX_ENTRIES } from "@/utils/log/shared";
import { NAILAIN_MATCH_PATTERN, RELEASES_URL } from "@/shared/deployment";

type OnClickData = Browser.contextMenus.OnClickData;
type CreateProperties = Browser.contextMenus.CreateProperties;
type Tab = Browser.tabs.Tab;

type ContextMenuDefItem = {
  info: CreateProperties;
  handler?: (info: OnClickData, tab?: Tab) => void;
};

async function notify(title: string, message: string) {
  await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("/icons/48.png"),
    title,
    message,
  });
}

async function handleExportLog() {
  try {
    const { count, filename } = await exportLogs();
    await notify("日志导出完成", `已导出 ${count} 条日志：${filename}`);
  } catch (error) {
    debugLog.error("Export logs failed", error);
    await notify(
      "日志导出失败",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function handleClearLogs() {
  try {
    const count = await clearLogs();
    await notify("日志已清除", `已清除 ${count} 条日志`);
  } catch (error) {
    debugLog.error("Clear logs failed", error);
    await notify(
      "日志清除失败",
      error instanceof Error ? error.message : String(error),
    );
  }
}

const contextMenuDefs: Record<string, ContextMenuDefItem> = {
  "show-version": {
    info: {
      id: "show-version",
      title: `当前版本：${VERSION}`,
      type: "normal",
      enabled: false,
      contexts: ["action"],
    } satisfies CreateProperties,
  },
  "check-release": {
    info: {
      id: "check-release",
      title: "查看最新版本",
      type: "normal",
      contexts: ["action"],
    } satisfies CreateProperties,
    handler(info: OnClickData) {
      if (info.menuItemId != "check-release") return;
      void browser.tabs.create({
        url: RELEASES_URL,
        active: true,
      });
    },
  },
  "export-log-all": {
    info: {
      id: "export-log-all",
      title: `导出全部日志（最近 ${LOG_MAX_ENTRIES} 条）`,
      type: "normal",
      contexts: ["action"],
    } satisfies CreateProperties,
    handler(info: OnClickData) {
      if (info.menuItemId != "export-log-all") return;
      void handleExportLog();
    },
  },
  "clear-logs": {
    info: {
      id: "clear-logs",
      title: "清除全部日志",
      type: "normal",
      contexts: ["action"],
    } satisfies CreateProperties,
    handler(info: OnClickData) {
      if (info.menuItemId != "clear-logs") return;
      void handleClearLogs();
    },
  },
  "open-in-auto-novel": {
    info: {
      id: "open-in-auto-novel",
      title: "在机翻站中打开链接",
      type: "normal",
      contexts: ["page", "link"],
      documentUrlPatterns: [
        "*://*.amazon.co.jp/*",
        "*://kakuyomu.jp/*",
        "*://*.syosetu.com/*",
        "*://novelup.plus/*",
        "*://syosetu.org/*",
        "*://*.syosetu.org/*",
        "*://*.pixiv.net/*",
        "*://*.alphapolis.co.jp/*",
        "*://novelism.jp/*",
        NAILAIN_MATCH_PATTERN,
      ],
    } satisfies CreateProperties,
    handler(info: OnClickData, tab?: Tab) {
      if (info.menuItemId != "open-in-auto-novel") return;
      const targetUrl = info.linkUrl ?? info.pageUrl ?? tab?.url ?? null;
      if (targetUrl == null) return;

      const redir = getRedirectionResult(targetUrl);
      if (!redir) {
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("/icons/48.png"),
          title: "错误：无法识别该链接",
          message: `无法解析该链接: ${targetUrl}\n请确认该链接为机翻站支持的站点。`,
        });
        return;
      }

      browser.tabs.create({
        url: redir.url,
        active: false,
        index: tab?.index ? tab?.index + 1 : undefined,
        openerTabId: tab?.id,
      });
    },
  },
};

export function addContextMenu() {
  browser.contextMenus.removeAll();
  for (const [_, item] of Object.entries(contextMenuDefs)) {
    browser.contextMenus.create(item.info);
  }
}

export function handleContextMenu(info: OnClickData, tab?: Tab) {
  const handler = contextMenuDefs[info.menuItemId as string]?.handler;
  if (handler) {
    return handler(info, tab);
  }
}
