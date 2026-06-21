# AGENTS.md

本檔案提供 AI agent 在此 repository 工作時的指引。

## 專案概覽

Chrome 擴充套件（Manifest V3）—「AI 劃詞助手」。純 Vanilla JS，無框架、無打包工具、無建置步驟。載入方式：`chrome://extensions` → 開發人員模式 → 載入未封裝項目。

## UI 語言與國際化（i18n）

UI 使用 Chrome 內建 i18n 機制，支援 55 種語言：

- **`_locales/<lang>/messages.json`**：每個語言目錄含約 50 個訊息鍵值，`default_locale` 為 `en`。
- **`manifest.json`** 中 `name`/`description` 使用 `__MSG_extName__` / `__MSG_extDescription__` 格式。
- **`popup.js`**：透過 `applyI18n()` 遍歷 `[data-i18n]`、`[data-i18n-placeholder]`、`[data-i18n-title]`、`[data-i18n-aria]` 屬性套用翻譯。
- **`content.js`**：透過 `t(key, ...args)` 輔助函式呼叫 `chrome.i18n.getMessage()`。
- **`background.js`**：右鍵選單標題透過 `chrome.i18n.getMessage()` 取得。
- 新增 UI 字串時，必須在 `_locales/en/messages.json` 新增鍵值，並同步更新所有語言檔案。
- **禁止在原始碼中硬編碼 UI 字串**，一律透過 i18n 機制。

## 暗色/亮色模式

根據系統 `prefers-color-scheme` 自動切換：

- **`popup.css`**：使用 CSS 自訂屬性（`var(--variable)`），透過 `@media (prefers-color-scheme: dark)` 覆寫變數值。
- **`content.js`**：`getThemeColors()` 函式根據 `window.matchMedia('(prefers-color-scheme: dark)')` 回傳兩組色彩物件，`injectStyles()` 使用色彩物件變數注入 CSS。系統切換主題時透過 `matchMedia.addEventListener('change')` 自動重新注入樣式。
- **禁止硬編碼顏色值**，popup.css 使用 CSS variables，content.js 使用 `getThemeColors()` 回傳值。

## RTL 支援

阿拉伯語（ar）、希伯來語（iw）、波斯語（fa）為 RTL 語言：

- `popup.js` 的 `applyI18n()` 偵測語言後設定 `<html dir="rtl">`。
- `content.js` 中 `_isRtl` 常數控制對話框 `dir` 屬性及訊息氣泡對齊方向。

## 架構注意事項

- **`content.css` 故意為空白。** 所有 content script 樣式透過 `content.js` 中的 `injectStyles()` 在執行時期動態注入，以避免與宿主頁面樣式衝突。注入的 `<style>` 元素標記 `data-aiext-styles="1"` 以便主題切換時移除重建。
- **CSS class 前綴 `__aiext_`**（常數 `PREFIX`）必須套用於所有注入的 class 名稱，禁止在 content script 中使用無前綴的 class。
- **`data-aiext="1"` 屬性**必須設定在擴充套件建立的所有 DOM 元素上，`isOurElement()` 依賴此屬性在選取事件中過濾自家 UI。
- **`content.js` 為 IIFE**，在所有頁面（`<all_urls>`）執行。載入時不得有副作用，所有 DOM 操作須在事件處理器內進行。
- API 呼叫使用 **OpenAI 相容的 `/v1/chat/completions` 搭配 SSE streaming**，更換供應商時必須維持此介面合約。
- **系統提示詞為英文**，但會根據使用者 UI 語言指示 AI 以該語言回應。中文使用者指示 AI 以相同中文變體（繁/簡）回應。
- **Base URL 自動正規化**：`normalizeBaseUrl()` 去除結尾斜線並在缺少版本路徑（`/v1`、`/v2` 等）時自動補上 `/v1`。
- 設定儲存於 `chrome.storage.sync`（鍵值：`apiKey`、`model`、`baseUrl`、`quickPrompts`、`defaultPin`）。
