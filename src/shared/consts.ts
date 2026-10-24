import packageJson from "@/../package.json";
import { BOOKS_ORIGIN } from "./deployment";

export const IS_DEBUG = import.meta.env.DEV;

export const MAX_PAGE_LOAD_WAIT_TIME = 1_000; // ms
export const DELAYED_TAB_CLOSE_TIME = 35_000; // ms

export const VERSION = packageJson.version;

export const DEFAULT_RATE_LIMIT_CONFIG: Record<string, RateLimitConfig> = {
  "*": {
    maxRequestsPerMinute: -1,
    minIntervalMs: 0,
    maxParallelRequests: 6,
  },
  "dict.youdao.com": {
    maxRequestsPerMinute: 300,
    minIntervalMs: 0,
    maxParallelRequests: 6,
  },
  "ncode.syosetu.com": {
    maxRequestsPerMinute: 300,
    minIntervalMs: 0,
    maxParallelRequests: 32,
  },
};

// 基础的请求速率测试实验
export const IS_TIMING = false;
(() => {
  if (IS_TIMING && IS_DEBUG) {
    console.warn("Timing mode enabled: all rate limits are disabled.");
    for (const [key] of Object.entries(DEFAULT_RATE_LIMIT_CONFIG)) {
      DEFAULT_RATE_LIMIT_CONFIG[key] = {
        maxRequestsPerMinute: -1,
        minIntervalMs: 0,
        maxParallelRequests: -1,
      };
    }
  }
})();

export const AutoNovelDomains = [
  "n.novelia.cc",
  "n.sakura-share.one",
  new URL(BOOKS_ORIGIN).hostname,
];
