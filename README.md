# Kotoban Addon

供 [Kotoban 小說站](https://books.kotoban.top/)使用的 Chrome／Edge／Firefox Manifest V3 擴充套件，提供瀏覽器端抓取、文庫匯入與閱讀器外部資源存取。

本專案 fork 自 [auto-novel/addon](https://github.com/auto-novel/addon)，保留上游作者及貢獻者的成果，以 [GPL-3.0](LICENSE) 授權。此 fork 的版本與上游分別發布。

## 安裝

從本 fork 的[最新發布頁](https://github.com/dekkmarsvin/addon/releases/latest)下載對應瀏覽器的檔案。下列 `<版本>` 以該頁版本為準；可用同頁的 `SHA256SUMS` 核對下載檔案。

| 瀏覽器         | 檔案                                         | 安裝方式                     |
| -------------- | -------------------------------------------- | ---------------------------- |
| Chrome／Edge   | `kotoban-addon-<版本>-chromium.zip`          | 解壓後載入擴充套件目錄       |
| Firefox 桌面版 | `kotoban-addon-<版本>-firefox-temporary.zip` | 暫時載入；重啟瀏覽器後須重載 |
| 原始碼         | `kotoban-addon-<版本>-sources.zip`           | 對照原始碼與建置資訊         |

### Chrome／Edge

1. 解壓 Chromium zip，保留內含 `manifest.json` 的目錄。
2. 開啟 Chrome 的 `chrome://extensions/`，或 Edge 的 `edge://extensions/`。
3. 開啟「開發人員模式」，選擇「載入未封裝項目／載入已解壓縮的擴充功能」，指定該目錄。
4. 重新載入已開啟的 Kotoban 書站頁面。

此 fork 的固定 Chromium ID 為 `cipknbnhmhaddapcipjncdaaibgcidgi`，與上游不同。更新時使用同一目錄並在擴充套件管理頁重新載入；請保留該目錄。

### Firefox

1. 開啟 `about:debugging#/runtime/this-firefox`。
2. 選擇「暫時載入附加元件」，指定 Firefox temporary zip，或解壓後的 `manifest.json`。
3. 重新載入 Kotoban 書站頁面。Firefox 重啟後需再次暫時載入。

Firefox 識別碼為 `addon@books.kotoban.top`。目前發布的是**未簽章的暫時載入包**，不提供可永久安裝的簽章 XPI 或自動更新。正式發行須另完成 Mozilla 簽章；本次未驗證行動瀏覽器安裝。

## 功能與網站權限

- 在 Kotoban 書站向 `window.Addon` 提供功能橋接，供瀏覽器端抓取、文庫匯入與外部圖片存取使用。
- 支援 NAILAIN 的 `https://nailain.alwaysdata.net/` 網域權限與小說頁面跳轉；其餘上游小說網站功能依網站與書站支援情況使用。
- 在支援的小說頁面使用工具列圖示或右鍵選單，可跳轉到 Kotoban 對應頁面。
- 為執行這些功能，擴充套件可讀取／修改授權網站的 Cookie、開啟或重用分頁、執行分頁內腳本，以及處理請求標頭與下載。

完整的權限及可存取網域以安裝包的 `manifest.json` 為準。網站權限與頁面 API 注入範圍是不同設定；授予小說來源存取權限不代表會在該來源頁面公開 `window.Addon`。

## 確認連線

安裝後開啟 `https://books.kotoban.top/`，在該頁開發者工具 Console 執行：

```js
await window.Addon.info();
```

應回傳此 fork 的版本及 `https://books.kotoban.top/`。若沒有 `window.Addon`，先確認擴充套件已啟用、已允許本站存取，再重新載入頁面。此檢查只驗證頁面與擴充套件連線；不會啟動小說抓取或翻譯。

## 資料與日誌

擴充套件會依呼叫的功能存取第三方小說／翻譯服務，並可能使用該網站的 Cookie；網路通訊不限於 Kotoban API。Cookie 功能可讀取、寫入或刪除授權網站的 Cookie。

除錯日誌保留在擴充套件的本地儲存，右鍵選單可匯出或清除，內容包括網址、錯誤與 Cookie 名稱等診斷資訊。`cookiesStatus()` 只向頁面回傳 Cookie 中繼資料，不含值。分享日誌前仍請檢查並移除敏感內容；請勿在 Issue、公開日誌或測試資料中放入真實帳密、Cookie 或 API Key。

## API

插件会将扩展函数挂载到 `window.Addon` 上，类型如下：

```typescript
type AddonCapabilityVersion = `${number}.${number}.${number}`;

type AddonCapabilityManifest = {
  [capability: string]: AddonCapabilityVersion | AddonCapabilityManifest;
};

type InfoResult = {
  version: string;
  homepage_url: string;
};

type CookieStatus = Partial<browser.cookies.Cookie> & {
  name: string;
};

type TabFetchOptions = {
  tabUrl: string;
  tabId?: number;
  forceNewTab?: boolean;
  forceWaitForLoad?: boolean;
  closeTimeout?: number;
};

type TabFetchError = Error & {
  /** 按发生顺序记录的重定向目标。 */
  redirectUrls?: string[];
  /** 最后一个重定向目标，等同于 redirectUrls.at(-1)。 */
  redirectUrl?: string;
  requestUrl?: string;
  tabId?: number;
};

type TabDomQueryOptions = {
  tabId?: number;
  forceNewTab?: boolean;
  forceWaitForLoad?: boolean;
  closeTimeout?: number;
};

type DomQueryResults = {
  tabId: number;
  results: string[];
  readyState: DocumentReadyState;
};

interface AddonApi {
  version: string;

  /** 兼容旧名称，等同于 capabilities。 */
  compat: AddonCapabilityManifest;

  /** 插件能力清单，可用于按版本判断功能是否可用。 */
  capabilities: AddonCapabilityManifest;

  info(): Promise<InfoResult>;

  /** 回傳 Cookie 中繼資料，不包含 value。 */
  cookiesStatus(params: {
    url?: string;
    domain?: string;
    partitionKey?: browser.cookies.CookiePartitionKey;
    keys: string[] | "*";
  }): Promise<Record<string, CookieStatus | null>>;

  cookiesPatch(params: {
    url: string;
    /** value 为 null 时删除对应 cookie。 */
    patches: Record<string, CookieStatus | null>;
  }): Promise<void>;

  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

  tabFetch(
    options: TabFetchOptions,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>;

  tabDomQuery(params: {
    tabUrl: string;
    selector: string;
    options?: TabDomQueryOptions;
  }): Promise<DomQueryResults>;

  spoofFetch(
    baseUrl: string,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>;
}

declare global {
  interface Window {
    Addon?: AddonApi;
  }
}
```

### tabFetch 重定向

`tabFetch` 的调用接口仍为 `Promise<Response>`。成功返回时：

- `response.url` 是 fetch 最终响应地址；
- `response.redirected` 表示 fetch 是否跟随过重定向；
- `X-AutoNovelAddon-Redirect-Url` 响应头是最后一个观测到的重定向目标；
- `X-AutoNovelAddon-Redirect-Urls` 响应头是 JSON 编码的完整重定向目标数组。

如果重定向后的请求因为 CORS、网络错误或验证墙而失败，Promise 会 reject，错误对象符合上面的 `TabFetchError`，调用方仍可根据 `redirectUrl` 切换 `tabUrl` 后重试：

```typescript
try {
  const response = await Addon.tabFetch(options, requestUrl);
  const redirectUrl = response.headers.get("X-AutoNovelAddon-Redirect-Url");
  // 根据业务响应和 redirectUrl 决定是否切换 tabUrl 后重试。
} catch (cause) {
  const error = cause as TabFetchError;
  if (error.redirectUrl) {
    const nextOptions = {
      ...options,
      tabUrl: new URL(error.redirectUrl).origin,
    };
    // 按调用方的重试策略再次调用 Addon.tabFetch。
  }
}
```

扩展必须同时具有初始请求域名和重定向目标域名的 `host_permissions`，否则浏览器可能不会向扩展暴露完整跳转链，也无法在目标域标签页执行脚本。

## 開發與上游同步

本 fork 以 [`90454c2e19004a9fb0455d4ba49b5b7c2e1dedd8`](https://github.com/auto-novel/addon/commit/90454c2e19004a9fb0455d4ba49b5b7c2e1dedd8) 為上游起點。維護差異限於 Kotoban 發布身分、網站／NAILAIN 權限、舊認證轉移功能退役，以及必要的橋接安全與可重現發布驗證。

使用 Node.js 24 與 `package.json` 指定的 pnpm 版本：

```shell
corepack pnpm install --frozen-lockfile
corepack pnpm compile
corepack pnpm build
corepack pnpm zip
```

真實 Chromium bridge smoke 使用獨立暫存 profile 與合成網站資料；不讀取目前瀏覽器的帳號或 Cookie：

```shell
corepack pnpm exec playwright install chromium
corepack pnpm test:browser
```

本機開發可用 `corepack pnpm dev` 或 `corepack pnpm dev:firefox`。發布流程及維護邊界見 [AGENTS.md](AGENTS.md)；功能修正優先回饋上游，避免長期維持第二套通用抓取／RPC 實作。

## 使用與授權

使用者應確認自己的存取與資料使用符合目標網站的政策及相關授權。程式依 GPL-3.0 與授權檔中的保固條款提供；原始授權與上游作者歸屬保留。
