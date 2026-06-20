# AGENTS.md

本檔案提供 AI agent 在此 repository 工作時的指引。

## 專案概覽

Chrome 擴充套件（Manifest V3）—「AI 劃詞助手」。純 Vanilla JS，無框架、無打包工具、無建置步驟。載入方式：`chrome://extensions` → 開發人員模式 → 載入未封裝項目。

## UI 語言

所有使用者介面文字使用**繁體中文（zh-TW）**，新增 UI 字串時請保持一致。

## 架構注意事項

- **`content.css` 故意為空白。** 所有 content script 樣式透過 `content.js` 中的 `injectStyles()` 在執行時期動態注入，以避免與宿主頁面樣式衝突。
- **CSS class 前綴 `__aiext_`**（常數 `PREFIX`）必須套用於所有注入的 class 名稱，禁止在 content script 中使用無前綴的 class。
- **`data-aiext="1"` 屬性**必須設定在擴充套件建立的所有 DOM 元素上，`isOurElement()` 依賴此屬性在選取事件中過濾自家 UI。
- **`content.js` 為 IIFE**，在所有頁面（`<all_urls>`）執行。載入時不得有副作用，所有 DOM 操作須在事件處理器內進行。
- API 呼叫使用 **OpenAI 相容的 `/v1/chat/completions` 搭配 SSE streaming**，更換供應商時必須維持此介面合約。
- 設定儲存於 `chrome.storage.sync`（鍵值：`apiKey`、`model`、`baseUrl`、`quickPrompts`、`defaultPin`）。
