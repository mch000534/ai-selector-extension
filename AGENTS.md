# Repository Guidelines

## 專案結構與模組組織

此專案是 Chrome Manifest V3 擴充套件，採純 Vanilla JavaScript，沒有框架、打包器或安裝依賴。主要入口在根目錄：`manifest.json` 定義權限、content scripts 與 popup；`content.js` 負責頁面內 AI 對話框；`background.js` 負責 service worker 與右鍵選單；`popup.html`、`popup.js`、`popup.css` 負責設定介面。

共用邏輯放在 `lib/`，例如 `lib/utils.js`、`lib/markdown.js`、`lib/shadow.js`、`lib/theme.js`。測試放在 `tests/`，目前以 `tests/pure-functions.test.js` 覆蓋純函式。圖示在 `icons/`，本地化字串在 `_locales/<lang>/messages.json`，文件在 `docs/`。

## 建置、測試與本機開發指令

- `node --test tests/pure-functions.test.js`：執行 Node 內建測試，驗證 Markdown、URL 正規化與安全 URL 判斷等純函式。
- `git status --short`：提交前確認只包含本次相關變更。
- 本機載入方式：開啟 `chrome://extensions`，啟用開發人員模式，選擇「載入未封裝項目」並指定專案根目錄。

本專案沒有 `npm install`、`npm run build` 或 dev server；修改檔案後請在 Chrome 擴充套件頁面重新載入。

## 程式風格與命名慣例

使用 2 空格縮排、分號、`const`/`let`，維持既有檔案的 Vanilla JS 風格。避免引入框架或打包工具。Content script 注入的 CSS class 必須使用 `__aiext_` 前綴，擴充套件建立的 DOM 元素應標記 `data-aiext="1"`，避免干擾宿主頁面。

UI 字串不得硬編碼；新增字串時先更新 `_locales/en/messages.json`，再同步其他語言檔。Popup 色彩使用 CSS variables，content UI 色彩透過 `lib/theme.js` 或既有 theme helper 管理。

## 測試準則

新增可獨立測試的純函式時，優先加入 `tests/pure-functions.test.js` 或新增 `tests/*.test.js`。測試命名應描述行為，例如 `normalizeBaseUrl appends /v1 when missing`。涉及 Chrome API、DOM 注入或 popup 行為時，至少手動驗證擴充套件載入、popup 設定、劃詞對話框與右鍵選單。

## Commit 與 Pull Request 指引

Git 歷史同時使用簡短祈使句與 Conventional Commits，例如 `Add context menu options...`、`feat: add recently closed conversations...`。建議提交訊息保持單一目的，格式可用 `feat: ...`、`fix: ...`、`docs: ...`。

PR 應包含變更摘要、測試結果、手動驗證步驟；若修改 UI，附上截圖或錄影。涉及 i18n、權限、儲存鍵或 API 行為時，請明確說明相容性影響。

## 安全與設定注意事項

API Key 僅應透過 `chrome.storage.sync` 儲存，不要寫入程式碼、文件範例或測試資料。維持 OpenAI 相容 `/v1/chat/completions` 與 SSE streaming 合約；調整遠端圖片抓取或 URL 處理時，保留私有網段與非 HTTP(S) scheme 防護。
