# AI 劃詞助手

> 在任意網頁劃選文字即可就地呼叫 AI 對話的 Chrome 擴充套件，支援多模態上下文、多組服務供應商設定檔與 BYOK 架構。

## ✨ 功能亮點

- **劃詞即問** — 選取網頁文字後出現浮動圖示，點擊即開啟 AI 對話框，無需切換分頁
- **網頁內右側抽屜聊天** — 可從設定 popup、右鍵選單或全域快捷鍵在目前頁面開啟右側抽屜，進行長對話並可套用目前頁面選取內容
- **多模態上下文** — 自動提取選取範圍內的文字與圖片（最多 4 張），一併發送給 AI；支援貼上、拖放圖片與縮圖燈箱預覽
- **多對話框並行** — 可同時開啟多個獨立對話框，各自維護對話歷史，支援拖曳、釘選與疊層管理
- **串流即時回應** — AI 回覆以 SSE 串流逐字顯示，支援 Markdown 渲染；串流疑似提前中斷時可一鍵「重新產生」
- **多供應商 BYOK** — 支援任何 OpenAI 相容 API，並內建 Anthropic、Google Gemini 專用 adapter（自動依 Base URL 判斷協定），每個對話框可獨立切換模型
- **服務供應商設定檔** — 將常用的 Base URL / API Key / 模型存成具名設定檔，下拉即可切換；內建 Mistral、OpenAI、Groq、OpenRouter、Anthropic、Gemini 快速填入選項
- **內建快速動作** — 右鍵選單直接提供翻譯、繁簡轉換、解釋、摘要、潤稿、產生教學等內建動作，加上最近的快速預設問題
- **對話記錄管理** — popup 內建「對話記錄」管理器，可跨頁面搜尋、重新命名、匯出（Markdown / JSON）與刪除已儲存的對話
- **上下文感知** — 顯示粗略 token 用量與模型視窗佔比，超過門檻時提示並可一鍵摘要較舊訊息
- **設定匯出/匯入** — 可將設定（不含 API Key）匯出為 JSON 備份或匯入還原
- **多語言支援** — 內建 55 種語言，自動偵測瀏覽器語言切換 UI，含 RTL 語言排版
- **暗色模式** — 根據系統設定自動切換亮色/暗色主題，並尊重 `prefers-reduced-motion`

## 📋 系統需求

- **瀏覽器**：Google Chrome（或 Chromium 系瀏覽器如 Edge、Brave），支援 Manifest V3
- **API 供應商**：任何提供 OpenAI 相容 `/v1/chat/completions` 端點的服務（OpenAI、Groq、Together AI、OpenRouter 等），或 Anthropic / Google Gemini 原生 API
- **API Key**：需向供應商申請有效的 API 金鑰

## 🚀 快速開始

### 安裝

**方式一：從 Chrome Web Store 安裝（推薦）**

前往 [Chrome Web Store](https://chromewebstore.google.com/detail/ddlpfggfmhfhkdlebijpihjbcfkbnlmm) 點擊「加到 Chrome」即可安裝。

**方式二：從原始碼載入（開發者）**

本專案為純 Vanilla JS，無需安裝任何依賴，直接載入即可：

1. 下載或 Clone 此專案至本地：
   ```bash
   git clone https://github.com/mch000534/ai-selector-extension.git ai-selector-extension
   cd ai-selector-extension
   ```

2. 開啟 Chrome，進入 `chrome://extensions`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」，選擇專案根目錄（`ai-selector-extension/`）
5. 擴充套件圖示將出現在工具列，安裝完成

### 設定

安裝完成後，需設定 API 供應商資訊：

1. 點擊工具列的擴充套件圖示，開啟設定頁面
2. 可從「預設供應商」下拉選單挑選 Mistral、OpenAI、Groq、OpenRouter、Anthropic 或 Gemini 快速帶入 Base URL 與建議模型，或手動填入以下欄位：

| 欄位 | 說明 | 範例 |
|------|------|------|
| API Base URL | 供應商的 API 基礎位址（輸入後失焦自動補上 `/v1`） | `https://api.openai.com/v1` |
| API Key | 向供應商申請的金鑰（點擊右側 👁 圖示切換顯示），僅保存在本機裝置上，不隨 Chrome 帳號漫遊 | `sk-xxxxxxxx` |
| 模型名稱 | 欲使用的模型 ID（可點擊「獲取」自動拉取列表） | `gpt-4o` |

3. （選用）將目前的 Base URL / API Key / 模型儲存為「服務供應商設定檔」，之後可下拉快速切換；重複儲存同一 Base URL 會更新既有設定檔而非新增
4. （選用）新增快速預設問題，方便日後一鍵填入
5. （選用）在「內建快速動作」清單中個別啟用或停用翻譯、繁簡轉換、解釋、摘要、潤稿、產生教學等動作
6. （選用）勾選「預設釘住對話框」，讓新對話框自動固定
7. （選用）取消勾選「顯示浮動按鈕」，可關閉劃選文字/圖片時出現的浮動 AI 圖示（仍可透過右鍵選單或快捷鍵開啟對話框）
8. 設定自動儲存，無需手動點擊儲存按鈕

### 執行

設定完成後，在任意網頁上：

1. 用滑鼠劃選一段文字
2. 選取範圍右下方出現浮動 AI 圖示
3. 點擊圖示開啟對話框
4. 在輸入框輸入問題，按 `Enter` 發送

也可以點擊 popup 內的「Open side panel」、在右鍵選單選擇「Open drawer」，或使用快捷鍵 `Alt+Shift+D`，於目前頁面開啟右側抽屜聊天；`Alt+Shift+A` 可直接開啟 popup 設定頁。快捷鍵可在 `chrome://extensions/shortcuts` 自訂。

## 📖 使用說明

### 基本操作

| 操作 | 說明 |
|------|------|
| 劃選文字 → 點擊圖示 | 開啟對話框，選取內容作為上下文 |
| `Enter` | 發送訊息 |
| `Shift + Enter` | 輸入框內換行 |
| `ESC` | 關閉最上層未釘選的對話框，或關閉圖片放大燈箱 |
| 拖曳標題列 | 移動對話框位置 |
| 拖曳右下角 | 調整對話框大小 |
| 點擊 📌 釘選按鈕 | 固定對話框（點擊外部不關閉） |
| 點擊「移至側邊面板」按鈕 | 將浮動對話框轉為右側抽屜，並保留對話紀錄與輸入內容 |
| 點擊「移至浮動視窗」按鈕 | 將右側抽屜轉為浮動對話框，並保留對話紀錄與輸入內容 |
| 貼上或拖放圖片 | 加入待送出圖片，與劃詞擷取圖片共用最多 4 張上限 |
| 點擊圖片縮圖 | 放大檢視（燈箱），`ESC` 或點擊外部關閉 |
| 點擊「重新產生」 | 串流疑似提前中斷時重試最後一則回覆 |
| 點擊 × 關閉按鈕 | 關閉對話框 |

### 右側抽屜聊天

- 從設定 popup、右鍵選單或快捷鍵 `Alt+Shift+D` 在目前頁面開啟右側抽屜
- 可直接進行一般聊天，並沿用相同的 API Base URL、API Key、模型與快速預設問題
- 可在抽屜標題列直接選擇或輸入本次要使用的模型
- 快速預設問題在抽屜內以晶片呈現，點擊即可填入輸入框
- 開啟抽屜時會讀取目前頁面的選取文字或圖片作為上下文
- 拖曳抽屜靠頁面內容側的邊緣，可自由調整抽屜寬度
- 右側抽屜使用 content script 注入，不需要 Chrome 原生 `sidePanel` 權限

### 多對話框使用

- 可同時開啟多個對話框，每個維護獨立的對話歷史
- 新對話框以級聯偏移開啟，避免重疊
- 點擊任一對話框可將其移至最上層
- 每個對話框的標題列可獨立切換 AI 模型
- 浮動對話框與右側抽屜可互相轉換：點擊標題列的「移至側邊面板」／「移至浮動視窗」圖示即可切換，對話歷史、輸入框內容與選取內容皆會保留

### 服務供應商設定檔

- 設定頁「服務供應商設定檔」可將目前的 Base URL、API Key 與模型另存為一組具名設定檔，方便在多個供應商之間切換
- 下拉選單選取設定檔即會套用對應的連線資訊
- 針對同一個 Base URL 重複儲存會更新既有設定檔，不會產生重複項目
- 首次開啟擴充套件時，會自動以目前連線建立一筆設定檔
- 設定檔（含 API Key）僅儲存在本機裝置（`chrome.storage.local`），不會隨 Chrome 帳號同步到其他裝置

### 對話記錄管理

- 設定頁點擊「對話記錄」開啟管理器，列出所有頁面（跨 host）中儲存的對話，包含開啟中與已關閉的
- 可用關鍵字搜尋標題、內容預覽、來源網站與模型名稱
- 支援重新命名對話標題
- 可單筆匯出為 Markdown 或 JSON（Markdown 內容可直接複製貼上到 NotebookLM 等工具）
- 支援單筆刪除或勾選多筆批次刪除

### 內建快速動作與右鍵選單

在任意頁面點擊右鍵，選擇「AI 劃詞助手」即可開啟對話框；若有選取文字，選單會直接列出：

- 最近使用的快速預設問題（最多前 5 個）
- 內建快速動作：**翻譯**、**繁簡轉換**、**解釋**、**摘要**、**潤稿**、**產生教學**

點擊後會以選取文字組裝對應提示詞並開啟對話框。若無選取文字，則開啟空白對話框直接提問。內建動作使用獨立設定（可在設定頁「內建快速動作」清單個別開關）、不佔用快速預設問題的 10 筆額度上限。

### 快速預設問題

在設定頁面可新增最多 10 個快速問題（如「翻譯成中文」「解釋這段程式碼」），對話框中會以晶片形式顯示，點擊即填入輸入框。

- **單擊**已存在的問題文字可直接編輯內容
- **拖曳**左側 ⠿ 把手可調整問題順序
- 點擊 × 按鈕刪除問題

### 上下文感知與長對話輔助

- 對話框會顯示粗略的 token 用量估算與目前模型視窗佔比，超過 80% 時會出現提示
- 佔比超過 90% 且歷史訊息超過 8 則時，可點擊「摘要較舊的訊息」：保留最後 6 則訊息，其餘壓縮為一則摘要
- 未送出的截圖、貼上或拖放圖片會隨對話紀錄一併持久化，重新整理頁面後仍可還原預覽

### 設定匯出/匯入

- 設定頁可將目前設定（模型、Base URL、快速預設問題、預設釘選等）匯出為 JSON 檔案
- **API Key 一律不會包含在匯出檔案中**，需在匯入後另行填入
- 可匯入先前匯出的 JSON 檔案還原設定

## ⚙️ 設定檔說明

擴充套件的設定分別儲存在 `chrome.storage.sync`（隨 Chrome 帳號跨裝置同步）與 `chrome.storage.local`（僅本機裝置）：

| 儲存鍵 | 儲存區 | 說明 | 類型 | 預設值 |
|--------|--------|------|------|--------|
| `apiKey` | local | API 金鑰（僅本機，不隨帳號漫遊） | string | — |
| `aiext_profiles_v1` | local | 服務供應商設定檔列表 | array | `[]` |
| `baseUrl` | sync | API 基礎位址（自動補上 `/v1`） | string | — |
| `model` | sync | 預設模型 ID | string | — |
| `quickPrompts` | sync | 快速預設問題列表 | string[] | `[]` |
| `builtInActions` | sync | 啟用中的內建快速動作 ID 列表 | string[] | 全部啟用 |
| `defaultPin` | sync | 新對話框是否自動釘選 | boolean | `true` |
| `showFloating` | sync | 是否顯示劃詞浮動按鈕 | boolean | `true` |

> 舊版本的 API Key 曾儲存在 `chrome.storage.sync`；擴充套件會在啟動時自動一次性遷移到 `chrome.storage.local`，遷移後從 `sync` 移除，避免金鑰隨帳號同步到其他裝置。

本機對話狀態同樣使用 `chrome.storage.local`：頁面浮動對話框與右側抽屜的對話紀錄儲存於 `aiext_dialogs_v1`。變更 API Key 或 Base URL 時會清除已儲存的對話。

## 🔌 API 介面

本擴充套件預設使用 OpenAI 相容的 API 介面，並會依 Base URL 自動偵測是否改用 Anthropic 或 Google Gemini 的原生協定（自動轉換請求格式、認證標頭與 SSE 事件解析）。

### 取得模型列表（OpenAI 相容）

```
GET {baseUrl}/models
Authorization: Bearer {apiKey}
```

回應格式：
```json
{
  "data": [{ "id": "gpt-4o" }, { "id": "gpt-4o-mini" }]
}
```

### 對話補全（串流，OpenAI 相容）

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [...],
  "stream": true
}
```

SSE 回應格式：
```
data: {"choices":[{"delta":{"content":"..."}}]}
data: [DONE]
```

### 多模態訊息

選取範圍含圖片時，圖片以 DataURL 格式發送：
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Here are the images provided by the user as context:" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

> 若供應商不支援多模態（回傳 400），擴充套件會自動降級為純文字模式重試。
> 使用 Anthropic 或 Gemini 供應商設定檔時，擴充套件會自動轉換為對應原生 API 格式，使用方式與上述介面一致，無需手動調整。

## ❓ 常見問題（FAQ）

**Q：對話框出現「請先設定 API Key」怎麼辦？**
A：點擊瀏覽器工具列的擴充套件圖示，在設定頁面填入 API Base URL、API Key 與模型名稱，設定會自動儲存。

**Q：支援哪些 AI 供應商？**
A：任何提供 OpenAI 相容 `/v1/chat/completions` 端點的供應商皆可，例如 OpenAI、Groq、Together AI、OpenRouter、Ollama（需開啟 API 服務）等；也內建 Anthropic 與 Google Gemini 原生協定支援，設定頁的「預設供應商」下拉選單可快速切換。

**Q：換了電腦後 API Key 會自動出現嗎？**
A：不會。API Key 與服務供應商設定檔僅儲存在本機裝置（`chrome.storage.local`），不會隨 Chrome 帳號同步；但 Base URL、模型、快速預設問題等其餘設定會透過 Chrome 帳號同步到其他裝置，換裝置後仍需重新輸入 API Key。

**Q：選取的圖片無法發送？**
A：圖片提取受瀏覽器 CORS 策略限制，若圖片伺服器不允許跨域存取，該圖片會被靜默跳過。文字內容不受影響。

**Q：頁面重新整理後對話記錄會保留嗎？**
A：浮動對話框與右側抽屜會在本機保留最近對話並可恢復，包含尚未送出的圖片附件。這些記錄不會同步到其他 Chrome 裝置，可在 popup 的「對話記錄」管理器中查看、搜尋、匯出或刪除。

**Q：可以在 Firefox 或 Safari 使用嗎？**
A：目前僅支援 Chrome Manifest V3。Firefox 需調整 `manifest.json` 的 `browser_specific_settings`，Safari 需透過 Xcode 包裝，均不在當前支援範圍。

**Q：API Key 安全嗎？**
A：API Key 僅儲存於本機 `chrome.storage.local`，不會透過 URL 參數傳輸，也不隨 Chrome 帳號同步。所有對話內容在使用者瀏覽器與 API 供應商之間直接傳輸，不經過第三方伺服器。設定匯出功能也刻意排除 API Key，避免備份檔外流造成金鑰外洩。

**Q：API Base URL 需要包含 `/v1` 嗎？**
A：不需要。輸入框失焦時會自動偵測，若結尾沒有版本路徑（如 `/v1`、`/v2`）則自動補上 `/v1`。例如輸入 `https://api.openai.com` 會自動修正為 `https://api.openai.com/v1`。

**Q：支援哪些語言？**
A：內建 55 種語言，包括中文（繁體/簡體）、英文、日文、韓文、德文、法文、西班牙文、阿拉伯文等。UI 語言會根據瀏覽器語言自動切換。AI 系統提示詞為英文，但會指示 AI 以使用者語言回應。

**Q：如何切換暗色模式？**
A：不需要手動切換。擴充套件會自動偵測作業系統的暗色/亮色模式設定並切換主題。變更系統設定後，對話框和設定頁面會即時跟隨切換。若系統開啟「減少動態效果」，擴充套件的動畫也會相應關閉。

## 🤝 貢獻指南

1. Fork 此專案
2. 建立功能分支：`git checkout -b feature/your-feature`
3. 遵循以下開發規範：
   - UI 文字使用 `chrome.i18n.getMessage()` + `_locales/` 多語言機制，不硬編碼 UI 字串
   - Content script 的 CSS class 必須加上 `__aiext_` 前綴
   - 所有注入的 DOM 元素必須設定 `data-aiext="1"` 屬性
   - 暗色模式色彩透過 `getThemeColors()` 或 CSS variables 處理，不硬編碼顏色
   - 維持純 Vanilla JS，不引入框架或打包工具
   - API Key 僅透過 `chrome.storage.local` 儲存，不寫入程式碼、文件範例或測試資料
4. 執行測試（Node 內建測試框架，無需安裝依賴）：
   ```bash
   node --test tests/*.test.js
   ```
5. 提交變更：`git commit -m "feat: your feature"`
6. 發起 Pull Request（CI 會自動執行上述測試並對 `background.js`、`content.js`、`popup.js`、`lib/*.js` 做語法檢查）

詳細開發指引請參閱 [AGENTS.md](AGENTS.md)。

## 🔗 相關連結

- [GitHub Repository](https://github.com/mch000534/ai-selector-extension)
- [Chrome Web Store](https://chromewebstore.google.com/detail/ddlpfggfmhfhkdlebijpihjbcfkbnlmm)

## 📄 授權

MIT License
