# AI 劃詞助手 — 程式碼審查與改善建議

> 審查日期：2026-09-26
> 審查對象：`shrimp` 工作區 @ commit `84fdf49`（manifest v1.1.1）
> 審查範圍：`content.js`、`background.js`、`popup.js`、`sidepanel.js`、`lib/*`、`tests/*`、`_locales/*`、`manifest.json`
> 性質：唯讀分析，未修改任何程式碼

---

## 目錄

1. [專案現況摘要](#1-專案現況摘要)
2. [P0：必須優先修復的缺陷](#2-p0必須優先修復的缺陷)
3. [P1：架構與品質改善](#3-p1架構與品質改善)
4. [P2：新增功能建議](#4-p2新增功能建議)
5. [執行順序建議](#5-執行順序建議)
6. [附錄：完整問題清單](#6-附錄完整問題清單)

---

## 1. 專案現況摘要

### 1.1 程式碼規模

| 檔案 | 行數 | 角色 | 狀態 |
|---|---|---|---|
| `content.js` | 2,710 | 頁內對話框、浮動圖示、抽屜、SSE 呼叫 | 運作中（其中 730 行是 CSS template，佔 27%） |
| `popup.js` | 550 | 設定頁（providers、quickPrompts、最近關閉對話） | 運作中 |
| `sidepanel.js` | 481 | 第二套聊天 UI | **死碼**（manifest 未宣告 `side_panel`） |
| `background.js` | 231 | service worker、右鍵選單、訊息路由 | 運作中 |
| `lib/chat.js` | 97 | 純函式（prompt 組裝、模型解析等） | 運作中 |
| `lib/markdown.js` | 37 | Markdown 渲染 | 運作中 |
| `lib/shadow.js` | 46 | closed shadow root 管理 | 運作中 |
| `lib/theme.js` | 61 | 亮/暗主題 | 運作中 |
| `lib/utils.js` | 17 | `escapeHtml`、`normalizeBaseUrl` | 運作中 |
| `tests/pure-functions.test.js` | 262 | 30 個測試，全部通過 | 覆蓋率偏低 |

### 1.2 依賴關係圖

```
manifest.json
├── content_scripts (<all_urls>)  → lib/utils, lib/shadow, lib/markdown, lib/chat, lib/theme, content.js
├── background.service_worker     → importScripts(lib/chat.js), background.js
├── action.default_popup          → popup.html → lib/utils, lib/chat, popup.js
└── (sidepanel.html)              → ⚠️ 未被任何 manifest 欄位引用
```

### 1.3 整體評估

**優點**
- 純 Vanilla JS、無建置流程，架構單純，審查與部署成本低
- `closed` shadow root 隔離良好，頁面腳本無法存取對話框內部
- i18n 一致性優秀：55 個語言 × 94 個 key 全部對齊，placeholder 集合與 `en` 完全一致，0 處不匹配
- `lib/markdown.js` 的 XSS 防護設計正確（先 `escapeHtml`、連結限定 `https?|mailto`）
- 訊息通路的 `sender.id` 驗證到位（`background.js:172`、`content.js:2485`）
- 32 個 `innerHTML` 插入點中 22 個已正確 escape

**主要弱點**
- `content.js` 2,710 行承擔了過多職責，測試覆蓋率為 0
- 「共享層」`lib/` 僅 258 行，不足以支撐 3 個 UI 層，導致邏輯大量重複
- 4 個影響資料正確性與安全的缺陷尚未修補
- 481 行程式碼不可達

---

## 2. P0：必須優先修復的缺陷

### 2.1 【資料遺失】每次儲存設定都清空所有對話歷史

**位置**：`popup.js:313-326`

```js
function save() {
  const apiKey = apiKeyInput.value.trim();
  // ...
  chrome.storage.sync.set({ apiKey, model, baseUrl, quickPrompts, defaultPin, showFloating }, () => {
    showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
  });
  // Clear persisted conversations — they belong to the previous config.
  try {
    chrome.storage.local.remove('aiext_dialogs_v1');
  } catch (e) { /* ignore */ }
}
```

**成因**：`save()` 內無條件清除 `aiext_dialogs_v1`，但它有 7 個呼叫點：

| 呼叫點 | 觸發情境 |
|---|---|
| `popup.js:142` | 切換供應商 |
| `popup.js:171` | 刪除 quick prompt |
| `popup.js:238` | 編輯 quick prompt |
| `popup.js:261` | 新增 quick prompt |
| `popup.js:331` | `debouncedSave()`（**輸入 API Key 時每 500ms 一次**） |
| `popup.js:345` | Base URL 正規化 |
| `popup.js:351-352` | checkbox 切換 |

**影響**：使用者逐字輸入 API Key 的整個過程中，已儲存的對話歷史被反覆清空。而且只清了 `aiext_dialogs_v1`，漏清 `aiext_sidepanel_chat_v1`，造成兩份聊天儲存狀態永久分歧。

**建議修法**
1. 載入設定時記錄 `apiKey` / `baseUrl` 的 baseline（`popup.js:117-133`）
2. `save()` 僅在 `apiKey` 或 `baseUrl` **實際變動**時才清除對話
3. 一併清除 `aiext_sidepanel_chat_v1`
4. 補上對話清除的確認提示，避免使用者意外

---

### 2.2 【致命 UX】重載頁面後整個網頁無法點擊

**位置**：`content.js:1190-1194`、`content.js:2625-2630`、`content.js:1306-1311`、`content.js:1602-1604`

`createDialog()` 的 overlay 僅在 `startPinned` 為真時跳過（`content.js:1306`），且 CSS 為全視窗攔截層（`content.js:90-97`）：

```css
.${PREFIX}overlay { position: fixed !important; width: 100vw !important;
  height: 100vh !important; background: transparent !important;
  pointer-events: auto !important; }
```

但 `restoreDialogsOnLoad()`（`content.js:1190-1194`）與 `restoreClosedDialog` 分支（`content.js:2625-2630`）呼叫 `createDialog(config, null, quickPrompts, ctx)` 時**未傳入 options**，因此：

1. `startPinned` 為 `undefined` → 建立了全視窗透明 overlay
2. 兩處都未呼叫 `togglePin()`（對比 `openDialog:2199` 有呼叫）
3. `bringToFront:1604` 設定 `overlay.style.zIndex = topZ - 1` → **第 N 個對話框的 overlay 會蓋住第 1..N-1 個對話框**
4. `MAX_PER_HOST = 10`（`content.js:1069`）→ 最多同時鋪 10 層全屏遮罩

**後果**：重新載入頁面若有未關閉的紀錄，整頁被透明 div 覆蓋，所有點擊被攔截，使用者必須逐一關掉對話框才能操作網站；多個未釘選對話框時，下層的完全無法點擊。

**建議修法**
```js
// content.js:1190 與 content.js:2625
const id = createDialog(
  { ...config, model: r.model || config.model },
  null,
  quickPrompts,
  ctx,
  { startPinned: true }   // ← 新增
);
```
並讓 `bringToFront()`（`content.js:1598-1605`）僅在 `state.overlay` 存在時設定 z-index。

**預估工作量**：約 5 行

---

### 2.3 【安全】XSS — `model` 未轉義就內插進 `innerHTML`

**位置**：`content.js:1325`

```js
<input class="${PREFIX}model-input" data-aiext="1" type="text"
     list="${PREFIX}model-list-${id}"
     value="${config.model || ''}"        // ← 沒有 escapeHtml
     placeholder="${t('dialogModelPlaceholder')}" ...>
```

**驗證**：`model` 設為 `"><img src=x onerror=alert(document.domain)><input value="` 可成功逃逸屬性，產生可執行 `onerror` 的 `<img>`。

**影響面**
- 對話框掛在**宿主頁面 document** 的 closed shadow root 內，注入的 handler 會在**頁面 origin** 執行
- `model` 的寫入路徑有 3 條：`popup.js:319`、`sidepanel.js:273`、`background.js:210`（`saveProviderPreset`，來自 content script）
- 讀取路徑：`content.js:1033`（`getConfig`）→ `createDialog`

這是全專案 26 處 `innerHTML` 中**唯一**漏掉 `escapeHtml` 的使用者可控資料，屬防禦縱深缺失。

**建議修法**
```js
// content.js:1325
value="${escapeHtml(config.model || '')}"
```
順手加固：
- `content.js:1344`、`content.js:1563` 的 `src="${src}"` → `escapeHtml(src)`
- `content.js:2380-2394` 插值 `t(...)` 前過 `escapeHtml`

**補測試**：在 `tests/pure-functions.test.js` 加入「dialog 模板不含未轉義 `config.model`」的斷言。

---

### 2.4 【安全】SSRF 防護可被 HTTP redirect 繞過

**位置**：`background.js:26-43`（`isSafeFetchUrl`）、`background.js:187-205`（`fetchImageAsDataUrl`）

**主要缺口**：`background.js:193` 的 `await fetch(msg.url)` 使用預設 `redirect: 'follow'`。攻擊者架一個 `https://evil.com/r` 回 `302 → http://169.254.169.254/latest/meta-data/iam/`，hostname 檢查通過、fetch 自動跟隨，**現有防護完全失效**。

**次要缺口**（實測可通過 `isSafeFetchUrl`）：

| 輸入 | 實際連到 | 原因 |
|---|---|---|
| `http://[::ffff:7f00:1]/` | 127.0.0.1 | IPv4-mapped IPv6，不符合 v4 regex、不以 `fe80:`/`fc`/`fd` 開頭 |
| `http://[fec0::1]/` | site-local（已棄用） | 未涵蓋 |
| `http://[64:ff9b::7f00:1]/` | NAT64 → 127.0.0.1 | 未涵蓋 |
| `http://100.64.0.0/` | CGNAT `100.64.0.0/10` | 未涵蓋 |
| `http://198.18.0.0/` | 基準測試網段 `198.18.0.0/15` | 未涵蓋 |
| `http://255.255.255.255/` | 有限廣播 | 未涵蓋 |

**已正確阻擋**（值得保留）：`localhost`、`*.localhost`、`::1`、`0.0.0.0/8`、`127/8`、`10/8`、`172.16-31`、`192.168`、`169.254/16`、`fe80:`/`fc`/`fd` 前綴、非 http(s) scheme。且十進位/八進位/十六進位 IPv4（`http://2130706433/`、`http://017700000001/`、`http://0x7f000001/`、`http://127.1/`）已被 WHATWG URL 正規化後捕捉。

**其他缺口**
- 回應無大小上限（無 `Content-Length` 檢查、`res.blob()` 無上限）→ 記憶體 DoS
- 無 `Content-Type` 驗證
- DNS rebinding 無法防護（檢查字串、fetch 才解析 DNS，TOCTOU）
- 測試本身是**複製貼上**：`tests/pure-functions.test.js:114-131` 註解明寫 `// (copied from background.js for testing)`，改動 `background.js` 不會讓測試失敗

**建議修法**
1. 新增 `lib/net.js` 存放 `isSafeFetchUrl`
2. `fetch(msg.url, { redirect: 'manual' })`，遇 3xx 時讀 `Location` 重跑檢查（最多 3 跳）
3. 補上 IPv4-mapped IPv6 展開、`fec0::/10`、`100.64.0.0/10`、`198.18.0.0/15`、`>=224.0.0.0`
4. 加上 `Content-Length` 與 blob size 上限
5. 測試改為 `vm.runInThisContext` 載入 `lib/net.js`，與 `lib/utils.js` 同一模式

---

## 3. P1：架構與品質改善

### 3.1 裁決 `sidepanel.*` 的去留（481 行死碼）

**現況**：
- `manifest.json` **沒有** `"side_panel"` 宣告，也**沒有** `"sidePanel"` 權限
- 全 repo 沒有任何檔案指向 `sidepanel.html`（唯一命中是它自己的 `<link>` 與 `<script>`）
- `sidepanel.js` 481 行 + `sidepanel.css` 398 行 + `sidepanel.html` 58 行 **永遠不會執行**

**連帶成本**：它帶入 22 個 i18n key（`sidePanel*` 21 個 + `contextMenuOpenSidePanel`），佔 94 個字串的 22%，且在 **51 個真實語言中 100% 保持英文未翻譯**（1,210 筆）。最新的 `dialogMoveToDrawerTooltip` / `dialogMoveToFloatTooltip` 也是 50/51 語言未翻。

**文案誤導**：popup 按鈕（`popup.html:13`，文案 `sidePanelOpenBtn` = "Open side panel"）實際執行 `chat.createOpenDrawerMessage({})` 開的是**頁內抽屜**。`contextMenuOpenSidePanel`（`background.js:76`）與 `dialogMoveToDrawerTooltip`（`content.js:1333`，"Move to side panel"）同樣誤導。

**兩個選項**

| | 選項 A：刪除（建議） | 選項 B：正式啟用 |
|---|---|---|
| 動作 | 刪 `sidepanel.*`、從 55 個語言檔移除 22 個 key | `manifest.json` 加 `sidePanel` 權限 + `side_panel.default_path` |
| 改動量 | 小 | 中 |
| 收穫 | 少維護 937 行與 1,210 筆翻譯 | 多一種不打擾頁面的聊天入口 |
| 風險 | 無 | 需重寫 3 處文案與入口 |

---

### 3.2 把 SSE 解析與重試狀態機抽到 `lib/api.js`

**重複量化**（實測）
- `sidepanel.js:327-432` vs `content.js:1983-2172`：SequenceMatcher ratio **0.433**，**58/96 非空白行完全相同**，9 段連續匹配
- 3 份 `fetchModels`（`popup.js:270-311`、`sidepanel.js:285-321`、`content.js:1753-1795`）相似度僅 0.19–0.33，**已各自漂移**
- `lib/chat.js:54-62` 已有 `parseModelIds`，但只有 `sidepanel.js:303` 在用；`popup.js:289` 與 `content.js:1781` 各自內聯且**缺 `Array.isArray` 防護**（`data.data` 為 truthy 非陣列時直接 throw）
- 硬編碼 `'https://api.openai.com/v1'` ×2、`'gpt-4o'` ×2、退避公式 `Math.min(1000 * 2^(n-1), 8000)` ×2、`maxAttempts = 3` ×2
- `sleep()` 也各定義一份（`content.js:1973`、`sidepanel.js:323`）
- 兩份實作**已經漂移**：`content.js:2155` 有 `if (!doneReceived && lineBuffer.trim())` 的額外保護，`sidepanel.js:421` 只有 `startsWith('data: ')`

**建議設計**

新增 `lib/api.js`：
```js
__aiext.api = {
  fetchModels({ baseUrl, apiKey, signal }),        // 統一 3 份
  createSseParser(),                                 // 統一 2 份，可測
  chatCompletion({ baseUrl, apiKey, model, messages,
                  signal, onDelta, onStatus, onFallback })  // 統一重試狀態機
}
```

**預期收穫**：消除約 160–200 行重複；`content.js` 從 2,710 行降到約 1,900 行；SSE parser 終於有測試對象；順帶讓「取消最多延遲 8 秒才生效」的問題（`content.js:2053`、`2084` 的 `await sleep()` 不可中斷）在重構時自然修掉。

**需同步更新**：`manifest.json:31-38`（content_scripts 加載）、`sidepanel.html:53-56`、`popup.html:97-99`。

---

### 3.3 統一 storage 存取層

**現況**：三種風格並存

| 檔案 | 風格 | 位置 |
|---|---|---|
| `popup.js` | raw callback | `popup.js:122` |
| `sidepanel.js` | 2 個 promise wrapper | `sidepanel.js:65-75` |
| `content.js` | 3 個獨立 promise wrapper | `content.js:1029-1064`、`1079-1089`、`2191-2198` |

**6 份 storage 讀取全部不檢查 `chrome.runtime.lastError`**（全 repo grep = 0）。其中 `getQuickPrompts:1045` 與 `getShowFloating:1058` 直接讀 `result.quickPrompts` / `result.showFloating`，`result` 為 `undefined` 時會在**非同步 callback 內拋錯**（外層 try/catch 抓不到）。

**建議**：新增 `lib/storage.js`
```js
__aiext.storage = {
  getSync(keys, fallback),   // 內含 lastError 檢查與型別正規化
  getLocal(keys, fallback),
  setLocal(obj)
}
```

**`quickPrompts` 的 4 種不同驗證程度**（應統一）

| 位置 | 驗證方式 |
|---|---|
| `popup.js:129` | `result.quickPrompts \|\| []`（無型別檢查） |
| `sidepanel.js:80` | `chat.normalizeQuickPrompts(...)`（**唯一正確**） |
| `background.js:83` | `Array.isArray(...) ? ... : []` |
| `background.js:145` | 同上（複製一份） |
| `content.js:1045` | `result.quickPrompts \|\| []`（無檢查） |

**數量上限三個不一致值**：`popup.js:257` 硬編碼 `< 10`、`background.js:7` `MAX_PROMPTS_IN_MENU = 20`、`content.js:1347-1350` 渲染時完全不設限。`docs/requirements.md` 宣稱 10。

**完全缺少 migration**：`grep -rni "migrat|schemaVersion|onInstalled"` 全 repo 只命中 `background.js:119-121`，且只重建右鍵選單。

---

### 3.4 `persistState` 的 race condition 與容量問題

**四個 race condition**

| # | 問題 | 位置 |
|---|---|---|
| a | `persistState` 是無鎖 read-modify-write，6 個呼叫點可交錯 → 遺失更新 | `content.js:1143-1167` |
| b | `closeDialog` 非同步寫 `closedAt` 與 `persistState` 競爭：後者以整個 record 物件替換（`records[idx] = rec`），會抹掉剛寫入的 `closedAt` | `content.js:1149-1150` vs `1586-1589` |
| c | `restoreDialogsOnLoad()` 在 `content.js:2704` fire-and-forget，其內部 `await saveDialogRecords` 會用**啟動時的舊快照**覆蓋期間新建的對話 | `content.js:1179-1220`、`2704` |
| d | `beforeunload` 的 async storage 寫入瀏覽器**不會等待**（程式碼註解 `content.js:2689-2690` 自己承認）；且 bfcache 命中時 `beforeunload` 不觸發 → 對話全部遺失（缺 `pagehide`） | `content.js:2681-2702` |

**容量估算危險**
```
MAX_TOTAL = 50（content.js:1070）
  × MAX_IMAGES_PER_DIALOG = 2（content.js:1071）
  × MAX_IMAGE_BYTES × 1.37 ≈ 411KB（content.js:1072/1108）
  ≈ 41 MB
```
`chrome.storage.local` 無 `unlimitedStorage` 權限，上限約 5 MB。`saveDialogRecords` 的 `catch` **完全靜默吞掉 quota 錯誤**（`content.js:1091-1096`），使用者不會知道資料沒存成。

**數字上限不一致**：UI 允許 4 張截圖（`content.js:1484`、`1490`、`1519`）、選取也抓 4 張（`content.js:941`），但持久化只留 2 張。

**建議修法**
1. 維護記憶體中的 `records` 快照（由 `chrome.storage.onChanged` 同步），改成單一 record 粒度的合併寫入
2. 用 `_persistQueue` promise chain 序列化所有寫入，一次解決 a/b/c
3. 加上 in-flight debounce（model input 已有 600ms，可推廣到 drag/persist）
4. `beforeunload` 改 `pagehide` + `event.persisted` 判斷
5. 統一圖片數量上限常數

---

### 3.5 全域事件監聽器的效能問題

`content.js` 注入**所有網頁**，以下 6 個監聽器永久掛在 `document` 上、永不移除：

| 監聽器 | 行號 | 問題 |
|---|---|---|
| `mousemove` | `content.js:1798` | **每次事件都寫入** `state.dialog.style.left/top`（`1815-1816`）→ 持續強制 layout |
| `mouseup` | `content.js:1820` | 全域，與選取監聽重複 |
| `keydown` | `content.js:1832` | ESC 關閉 |
| `mouseup` | `content.js:2423` | 劃選偵測 |
| `mousedown` | `content.js:2454` | 避免選取消失 |
| `mouseover` / `mouseout` | `content.js:2460` / `2471` | **頻率極高**，每次都 `e.target.closest('img')` |

這是全檔最大的效能風險，也是使用者可直接感知的頁面流暢度問題。

**建議**
- `_showFloating === false` 時完全不註冊（`content.js:22`、`1053`）
- `mouseover` 改為「命中大圖後才臨時掛 `mouseout`」
- `mousemove` 加 `passive: true` 與 rAF 节流

---

### 3.6 其他資源管理問題

| 問題 | 位置 | 影響 |
|---|---|---|
| `showCropOverlay` 的 Promise 可能永不 resolve | `content.js:849-850` 的 `if (!isDragging) return` guard | 若 `mouseup` 發生在 overlay 外（監聽綁在 overlay 而非 document），`content.js:1538` 的 `await` 永久掛起 → **對話框永久隱形**、`cameraBtn` 永久停用 |
| 關閉對話框不 abort 進行中的 fetch | `content.js:1576-1596` | `callAI` 的 controller 留在迴圈內繼續讀 stream，背景持續消耗頻寬/電量直到 `[DONE]`；`convertFloatingToDrawer:2304` 必定踩到 |
| `lib/shadow.js:4-26` 的 `ensure()` 不檢查 `host.isConnected` | 且無 `destroy()` | SPA 替換 `document.body` 後 shadow host 脫離文件 → 整個 UI 消失且 `root` 仍指向斷線的樹 |
| `_bodyShiftStyleEl` 從不移除 | `content.js:1677-1691` | 若因 extension context invalidated 未執行 `clearBodyShift()`，`document.body` 的 `margin-*: … !important` 會**永久殘留並破壞宿主頁面版面** |
| `imageToDataURL` 的 fetch 無 `signal`、無 timeout | `content.js:895-930` | 掛住的連線讓 `extractContextFromSelection` 永久 pending → 浮動圖示永不出現 |
| `pendingScreenshots` 不進 record | `content.js:1494`、`1543`；`toRecord:1111-1141` 未涵蓋 | 截圖後、送出前重載頁面 → 靜默遺失 |
| MediaQueryList 未保存參考 | `content.js:2706` | 每次 `matchMedia` 建立新物件，listener 永不移除 |

---

### 3.7 `_contextInvalid` 永久鎖死旗標

**位置**：`content.js:4-17`（`contextValid`）、`41`（`t` 的 catch）、`1234`、`1923`、`2677`

`_contextInvalid` 一旦被設為 `true` **永不復原**，`contextValid()` 之後一律回 `false`，導致：

- `t()`（`content.js:39`）→ 直接回傳 **i18n key 原文**（使用者會看到字面量 `dialogTitle`）
- `getShowFloating()`（`c2ontent.js:1056`）→ 恆回 `true`
- `_storageAvailable()`（`content.js:1076`）→ 恆 `false` → **所有持久化靜默失效**

而它會被**單次暫時性例外**觸發，例如 `showFloatingIcon:1234` 的 `catch { _contextInvalid = true; }`（`chrome.runtime.getURL` 一次失敗）。這是全檔最脆弱的設計。

**建議**：把「context 已失效」與「單次 API 失敗」拆開——只有 `chrome.runtime.id == null` 這個不可逆條件才設旗標，其餘 catch 只 log。

---

### 3.8 其他已確認的缺陷

| 問題 | 位置 |
|---|---|
| `topZ` 單調不重置，約 248 次 `bringToFront` 後超過 `2147483647`，CSS z-index 失效 | `content.js:26-27`、`1601` |
| 浮動圖示 CSS 固定 `z-index: 2147483647`，**永遠高於所有對話框** | `content.js:75` |
| `showSettingsWarning` 硬寫 `zIndex = 2147483640`，若 `topZ` 已超過則被蓋住 | `content.js:2398-2399` |
| 位置計算硬寫 420/440/400 與 CSS `max-width: 90vw` 不一致，視窗 < 467px 時對話框溢出；**完全沒有 RTL 位置處理** | `content.js:1361-1371` vs `101`、`105` |
| `state.dialog` 有 `resize: both`（`content.js:120`），但尺寸只透過 inline style 讀取 → **手動調整後的大小不會被持久化** | `content.js:120`、`1118-1121` |
| `applyBodyShift` 對宿主頁面 `document.body` 寫入 `margin-*: … !important`，會破壞 `body{margin:0}` + flex 置中的 SPA 版面 | `content.js:1693-1707` |
| 縮放時改寫 `document.documentElement` 的 cursor/userSelect，若 `mouseup` 遺失 → **整頁游標永久變 ew-resize、無法選取文字** | `content.js:1664-1665`、`1824-1825` |
| `hideFloatingIcon` 沒 clear `_iconHoverTimer` → 舊 timer 會把新圖示隱藏造成閃爍 | `content.js:1239-1243`、`1278-1283` |
| `_scrollAtBottom` 是**模組級**變數但語意為「每個對話框」，兩個對話框同時串流會互相污染 | `content.js:1853-1859`、`2115-2119` |
| 設定變更不傳播到既有對話框：`storage.onChanged` 只監聽 `showFloating` | `content.js:2668-2677` |
| `openDialog()` 不重新讀取當前選取，直接沿用 `currentContext`；`openDrawer()` 有呼叫 → **兩個入口語意不一致** | `content.js:2175-2201` vs `2218` |
| 無 `popstate`/`hashchange`/`pageshow` 監聽，SPA 導航後 `currentContext` 仍是舊頁面內容 | `content.js:21` |
| `restoreDialogsOnLoad` 只比對 `location.hostname`（但 `toRecord` 存 `location.href`）→ 同 host 不同 SPA 路由的對話會被自動還原，**最多 10 個且無使用者同意** | `content.js:1114`、`1183` |
| `readStream` 空回應仍寫入 history（`content: ''`），會把空的 assistant turn 送回 API | `content.js:1944` |
| `extractContextFromSelection` 循序 await 4 張圖，應改 `Promise.all` | `content.js:940-944` |
| `onMessage` 是 175 行的 `if/else if` 長鏈，且 `content.js:2486` 之後縮排層級完全錯亂 | `content.js:2485-2660` |
| `injectStyles()` 在 IIFE 尾端才執行，若 `document.body` 尚未存在 → CSS 被寫進 `document.head`，**暴露在頁面層級**（非 shadow 隔離）且永不移入 | `content.js:2679-2682`、`780-781` |
| 權限過大：`host_permissions: ["<all_urls>"]` 屬冗餘（content script 已透過 `matches` 取得、`captureVisibleTab` 已有 `activeTab`），讓商店頁面顯示「讀取並變更您所有網站上的資料」 | `manifest.json:15-17` |
| `providers.json` 在 `web_accessible_resources` 對 `<all_urls>` 開放，無必要 | `manifest.json:49-58` |
| `captureScreenshot` 只驗 `sender.id`，不綁定 `sender.tab`，背景分頁的 content script 可要求擷取使用者正在看的分頁畫面 | `background.js:175-185` |
| `saveProviderPreset` 未驗 `msg.baseUrl` 的型別與 scheme | `background.js:207-217` |
| `fillInput` 把 `msg.srcUrl` 直接塞進 `currentContext.images`，無 URL 白名單 | `content.js:2539-2571` |
| `normalizeBaseUrl` 不檢查 scheme：`'javascript:alert(1)'` → `'javascript:alert(1)/v1'`；`'not a url'` → `'not a url/v1'`。且 `popup.js:313-326` 的 `save()` 零驗證直接落盤 | `lib/utils.js:10-16` |
| `apiKey` 進 `storage.sync` → 離開機器進入 Google 帳號（配額 8KB/item、120 次/分鐘寫入） | `popup.js:319` |
| `providers.json` 只有 4 家、`model` 是單一字串（會隨供應商改版過期）、無更新機制、無每供應商獨立金鑰、無自訂 auth header | `providers.json` |
| `openDrawer` 的 RTL 分支邏輯繞但正確（`content.js:2235-2237` 先設 `right='auto'` 再設 `left='0px'`，而 `2235` 已先 `left=''`） | `content.js:2235-2237` |

---

### 3.9 死碼清單（已 grep 確認無呼叫點）

| 項目 | 行號 | 附註 |
|---|---|---|
| `sidepanel.js` / `.html` / `.css` | 全檔 | 937 行，見 §3.1 |
| `refreshBodyShiftForDrawer()` | `content.js:1726-1738` | **因為是死碼，導致視窗 resize 時 body margin 不重算、抽屜與內容錯位**——應接回 `window.resize` 監聽而非刪除 |
| `deleteRecord()` | `content.js:1169-1177` | 從未呼叫 → 關閉的對話 record 永遠只被標 `closedAt`，從不真正刪除 |
| `autoScroll()` | `content.js:1845-1849` | 已被 `autoScrollStreaming` 取代 |
| `_shadowQuery` / `_shadowQueryAll` | `content.js:47-48` | 未使用 |
| `getThemeColors` | `content.js:50` | 未使用 |
| `messagesHaveImages` / `stripImagesFromMessages` | `content.js:1975-1981` | 純 pass-through 包裝 `lib/chat.js` 同名函式，只為換名字 |
| `_persistedIds` | `content.js:1073` | 只寫不讀 |
| `opt.dataset.baseText` | `popup.js:88` | 設定後從未讀取 |
| `getThemeColors` / `messagesHaveImages` | `lib/theme.js`、`lib/chat.js` | 只被間接呼叫 |

### 3.10 主題色票三套並存

| 檔案 | accent | dark accent |
|---|---|---|
| `lib/theme.js:8-46` | `#667eea` | `#7c8ff0` |
| `popup.css:1-50` | `#667eea` | — |
| `sidepanel.css:1-19` | **`#3b6ea8`** | **`#76a9e0`** |

`popup.css` 與 `sidepanel.css` 都是 extension page，可直接共用 `lib/theme.js`（需把 `applyThemeVars`（`lib/theme.js:48-60`）與 shadow DOM 解耦，抽成 `getPalette()` + 兩個 applier）。

### 3.11 關於重複程式碼的其他發現

| 重複內容 | 位置 A | 位置 B | 差異 |
|---|---|---|---|
| record 還原邏輯（21 行） | `content.js:1196-1219` | `content.js:2631-2653` | **逐行相同**（唯一差異 `continue` vs `return sendResponse`） |
| closed-list 查詢（42 行） | `popup.js:425-466` | `content.js:2572-2610` | 已漂移：`popup.js:451` 缺 `url` 欄位；TTL 欄位不同（`popup` 用 `closedAt`、`content` 用 `lastActive`） |
| 錯誤提示 DOM 建構 | `content.js:1936-1940` | `content.js:1956-1962` | — |
| 重試提示節點操作 | `content.js:2045-2052` | `content.js:2075-2083` | 都用 `cancelEl.previousSibling.previousSibling.nodeType === 3` 這種脆弱操作 |
| Markdown 渲染 + 複製按鈕 | `content.js:1872`、`1942`、`2167` | — | 應抽 `renderAssistantBubble(bubble, text)` |
| RTL 語言清單 | `popup.js:57`、`sidepanel.js:43` | `lib/theme.js:4` | 3 份 |
| i18n wrapper `t()` | `content.js:38`、`sidepanel.js:36`、`background.js:45` | — | 4 份；`popup.js` 完全不用 wrapper，30+ 次直接寫 `chrome.i18n.getMessage()` |
| `normalizeBaseUrl(baseUrl) + '/models'` | `popup.js:283`、`sidepanel.js:299` | `content.js:1777` | 3 份 |
| 背景選單 quickPrompts 讀取 | `background.js:82-84` | `background.js:144-147` | 2 份複製 |

---

## 4. P2：新增功能建議

以下依「效益 vs 實作成本」排序。

### 4.1 多組 Provider 設定檔（各自獨立金鑰）

**現況限制**：`apiKey` 是**全域單一**（`popup.js:314-319`），兩家不同供應商的金鑰無法並存。切換供應商就必須換金鑰。

**建議**
- 資料結構改為 `providers: { [id]: { name, baseUrl, apiKey, model, authHeader, customHeaders } }`
- 保留目前的單一設定為遷移來源（`background.js:onInstalled` 加 migration）
- 對話框層級選擇 provider，而非全域
- API Key 選項改存 `storage.local`（不同步到 Google 帳號）——這同時解決 §3.8 的 `apiKey` 進 `storage.sync` 問題

**效益**：使用者最直接的痛點之一。**成本**：中等（需資料遷移 + 設定頁 UI 改版）

### 4.2 支援非 OpenAI 相容格式

**現況**：三處都硬編碼 `Authorization: Bearer`（`popup.js:285`、`sidepanel.js:300`、`content.js:1778`）與 OpenAI 的 request/response 格式。

**建議**：新增 adapter 層
```js
__aiext.api.adapters = {
  openai:    { buildRequest, parseResponse },   // 現有
  anthropic: { buildRequest, parseResponse },   // /v1/messages, x-api-key
  gemini:    { buildRequest, parseResponse }    // generativelanguage.googleapis.com
}
```
- Anthropic 的 SSE 事件格式（`content_block_delta`）與 OpenAI 不同，adapter 可吸收差異
- 同時支援自訂 auth header（`x-api-key`、`api-key`）與自訂 header

**效益**：擴大可用供應商範圍。**成本**：較高（需處理 3 種 SSE 格式）

### 4.3 對話管理：搜尋、重新命名、匯出

**現況**：只有「最近關閉的對話」清單（`popup.js:425-521`）與 host-scoped 的自動還原（`content.js:1179-1220`），沒有全量管理介面。

**建議**
- 設定頁加「對話管理」分頁：列出全部紀錄，支援關鍵字搜尋（比對 `conversationHistory`）
- 重新命名（record 加 `title` 欄位，用第一則使用者訊息當預設）
- 匯出為 Markdown / JSON / 貼到 NotebookLM
- 批次刪除（`deleteRecord` 死碼正好補上）

**效益**：對話累積後的必然需求。**成本**：低（`deleteRecord` 已有）

### 4.4 訊息編輯重發與重新生成

**建議**
- 每則使用者訊息 hover 顯示「編輯」與「重新生成」
- 編輯後**截斷**後續對話並重發（而非分支）
- assistant 訊息顯示「重新生成」與「複製」
- 可選的「分支」模式：同一個 prompt 保留多個候選回答

**效益**：符合 ChatGPT/Claude 等主流工具的心智模型，使用者不需要「重開一個對話框」。**成本**：低（`conversationHistory` 已是單一陣列）

### 4.5 快捷動作（右鍵一鍵翻譯/改寫/總結）

**現況**：右鍵選單只有固定項目（`background.js:53-170`），且 quickPrompts 塞在子選單。

**建議**
- 選取文字右鍵 → 直接在選單列出前 5 個 quickPrompts（不設子選單層級）
- 內建系統動作：翻譯、繁簡轉換、解釋、摘要、潤稿、產生教學
- 這些內建動作**不寫入** `quickPrompts`（避免佔用使用者的 10 個額度），走獨立的 `builtInActions` 設定

**效益**：把擴充套件從「聊天框」變成「翻譯/摘要工具」。**成本**：低

### 4.6 快捷鍵觸發

**現況**：`manifest.json` 沒有 `commands` 宣告。已知快捷鍵只有對話框內的 Enter / ESC。

**建議**
```json
"commands": {
  "_execute_action": { "suggested_key": { "default": "Alt+Shift+A" } },
  "open-drawer":    { "suggested_key": { "default": "Alt+Shift+D" } }
}
```
- 讓使用者不需劃詞也能隨時開啟抽屜
- 可在設定頁自訂快捷鍵

**效益**：中。**成本**：低

### 4.7 真正接上 Chrome side panel

見 §3.1 選項 B。若使用者偏好「不打擾頁面」的長對話，這是 Chrome 原生最佳解（可與分頁並存、跨分頁保留）。

**成本**：中等（需重寫 3 處文案、補 `sidePanel` 權限、決定與頁內抽屜的取捨）

### 4.8 模型能力感知：自動處理長上下文

**建議**
- 呼叫前估算 token，接近 context window 時主動提示並提供「總結先前對話」動作
- 顯示目前對話的粗略 token 數（`ceil(chars / 4)` 即可，不需要真的 tokenizer）
- 可選的自動摘要：超過門檻時把最早幾輪壓縮成摘要

**成本**：低～中

### 4.9 圖片處理強化

**建議**
- 截圖時支援框選區域（已有 `showCropOverlay`）與**全頁截圖**拼接
- 圖片預覽可放大檢視、移除單張
- 多張圖片時在送出的訊息中顯示縮圖列
- 修正 `pendingScreenshots` 不進 record 的問題（§3.6）

**成本**：低～中

### 4.10 其他較小但實用的想法

- **拖放圖片/檔案到對話框**即可加入上下文（目前只有貼上與截圖）
- **從剪貼簿直接開問**：右鍵選單加「詢問剪貼簿內容」
- **串流中斷重連**：偵測 `[DONE]` 未收到就提問是否重試（目前失敗只整則重試）
- **串流期間可捲動查看**：`_scrollAtBottom` 改為 per-dialog（§3.8）
- **對話框搜尋關鍵字高亮**（Ctrl+F 搜尋對話內容）
- **設定檔匯出/匯入**（不含 API Key，或明確標註會包含）
- **自動更新 `providers.json`**：加版本欄位與更新檢查，避免模型名稱過期
- **鍵盤可及性**：對話框 focus trap、Tab 順序、ARIA role/label 完整化
- **`prefers-reduced-motion` 支援**：尊重使用者的動態偏好設定

---

## 5. 執行順序建議

### 階段一：止血（約 1 小時，風險極低）

| # | 項目 | 位置 | 工作量 |
|---|---|---|---|
| 1 | 修 `save()` 清除對話歷史 | `popup.js:313-326`、`117-133` | ★ |
| 2 | 修還原對話的全屏遮罩 | `content.js:1190`、`2625` 傳 `{ startPinned: true }`；`content.js:1604` 條件設 z-index | ★ |
| 3 | 修 `model` 的 XSS | `content.js:1325` 加 `escapeHtml` | ★ |
| 4 | SSRF 加 `redirect: 'manual'` | `background.js:193` | ★ |

**驗證方式**：輸入 API Key 時開著「最近關閉的對話」確認不被清空；重載有紀錄的頁面確認可正常點擊；`model` 設為 `"><img src=x onerror=alert(1)>` 確認不彈窗。

### 階段二：低風險清理與測試（半天～1 天）

| # | 項目 | 位置 |
|---|---|---|
| 5 | 統一 `chat.parseModelIds` / `normalizeQuickPrompts` 的使用 | `content.js:1781`、`1045`（**2 行改動，全專案效益/工作量比最高**） |
| 6 | 移除死碼，但把 `refreshBodyShiftForDrawer` 接上 `window.resize` | `content.js:1169-1177`、`1845-1849`、`47-50`、`1726-1738` |
| 7 | `isSafeFetchUrl` 移入 `lib/net.js`，測試改為載入真正程式碼，補 redirect / IPv6 測試 | `background.js:26-43`、`tests/pure-functions.test.js:113-159` |
| 8 | 修正 `_contextInvalid` 永久鎖死 | `content.js:4-17`、各 `catch` |
| 9 | 修 `showCropOverlay` 永不 resolve（對話框永久隱形） | `content.js:849-850`、`1518-1556` |
| 10 | 修 `hideFloatingIcon` 未 clear timer | `content.js:1278-1283` |
| 11 | 新增 `tests/i18n.test.js`：斷言 55 個語言檔 key 集合相等於 `en`、placeholder 集合相等、無空字串 | 新檔 |
| 12 | 補 `normalizeBaseUrl` 負向測試（Azure 路徑、非 http scheme） | `tests/pure-functions.test.js` |

### 階段三：架構重構（2～3 天）

| # | 項目 | 影響 |
|---|---|---|
| 13 | 裁決 `sidepanel.*` 去留（選項 A 或 B） | 移除 937 行死碼，或啟用 side panel 功能 |
| 14 | 新增 `lib/api.js`：SSE parser、重試狀態機、`fetchModels` 收斂 | 消除約 200 行重複，內容.js 降至約 1,900 行，**並讓 SSE parser 終於可測** |
| 15 | 新增 `lib/storage.js`：統一 wrapper + `lastError` 檢查 + `schemaVersion` migration | 消除 6 份重複、修掉非同步 callback 拋錯 |
| 16 | `persistState` 改增量寫入 + `_persistQueue` 序列化 + `pagehide` | 一次解決 4 個 race 與 quota 問題 |
| 17 | 抽出 `applyRecordToDialog`、`buildClosedListItem` | 消除 21 行 + 42 行重複 |
| 18 | 收斂全域事件監聽器（條件註冊 + throttle） | 頁面流暢度 |
| 19 | `lib/shadow.js` 加 `isConnected` 檢查與 `destroy()` | 修 SPA 導航後 UI 消失 |
| 20 | `PREFIX` 模板拼接改為 `createElement` + `classList` | 消除 60+ 處字串拼接風險 |
| 21 | 主題色票收斂為單一來源 | 視覺一致性 |

### 階段四：新增功能（依 §4 優先序）

建議順序：4.1 多組 Provider → 4.4 訊息編輯重發 → 4.3 對話管理 → 4.5 快捷動作 → 4.6 快捷鍵 → 4.2 多格式 adapter → 4.7 side panel

---

## 6. 附錄：完整問題清單

### 6.1 問題統計

| 等級 | 數量 | 說明 |
|---|---|---|
| P0 阻斷級 | 4 | 資料遺失、頁面無法操作、安全漏洞 |
| P1 嚴重 | 6 | 架構重複、資源洩漏、效能 |
| P2 一般 | 30+ | 死碼、數值不一致、文案、權限過大 |
| 功能建議 | 10 | 見 §4 |

### 6.2 尚未驗證的疑點

以下為分析時提出的假設，實作前建議先人工重現確認：

1. `content.js:1890` 的 `innerHTML` 插值來源是否真的無使用者輸入
2. `lib/markdown.js:11-12` 的 `\u0000N\u0000` 佔位符碰撞，模型輸出 `\u00005\u0000` 導致 `undefined` 或重複注入的實際影響範圍
3. `applyBodyShift` 對不同 SPA 版面的破壞程度（需實測數種常見框架）
4. `restoreDialogsOnLoad` 在同一 host 多路由的自動還原，實際會還原幾個
5. `save()` 清除對話的實際影響——需確認 `chrome.storage.local.remove` 與 content script 的 `persistState` 是否有競爭

### 6.3 建議的驗證工具

目前專案無 CI、無 lint、無 i18n 驗證腳本（`.gitignore:26` 甚至註明「Node.js（預留，目前專案無建置流程）」）。建議加入：

- `node --test tests/` 作為提交前必跑（AGENTS.md 已列此指令）
- i18n 一致性測試（`tests/i18n.test.js`）
- 手動驗證清單（AGENTS.md 已要求）：擴充套件載入、popup 設定、劃詞對話框、右鍵選單
- 建議補上：`docs/requirements.md` 與實際功能的對照檢查（`host_permissions`、`side_panel`、權限清單都與文件不符）

### 6.4 文件與實況不符處

| 文件 | 宣稱 | 實況 |
|---|---|---|
| `docs/AGENTS.md:13` | 每個語言目錄含約 50 個訊息鍵值 | 實際 **94** 個 |
| `docs/requirements.md` | 快速預設問題最多 10 個 | `background.js:7` 是 20、`content.js` 不設限 |
| `docs/requirements.md` | Out of Scope：跨裝置對話同步 | 但 `apiKey` 本身同步到 `storage.sync` |
| `manifest.json` | — | `sidepanel.*` 未在 manifest 宣告，README 卻宣稱有側邊欄功能 |
| `popup.html:13` | 「開啟側邊欄」 | 實際開啟頁內抽屜 |

---

*文件結束。若要開始實作，建議從 §5 階段一開始，每項獨立 commit 並依 AGENTS.md 的 PR 指引說明相容性影響。*
