# AI 劃詞助手

> 在任意網頁劃選文字即可就地呼叫 AI 對話的 Chrome 擴充套件，支援多模態上下文與 BYOK 多供應商架構。

## ✨ 功能亮點

- **劃詞即問** — 選取網頁文字後出現浮動圖示，點擊即開啟 AI 對話框，無需切換分頁
- **多模態上下文** — 自動提取選取範圍內的文字與圖片（最多 4 張），一併發送給 AI
- **多對話框並行** — 可同時開啟多個獨立對話框，各自維護對話歷史，支援拖曳、釘選與疊層管理
- **串流即時回應** — AI 回覆以 SSE 串流逐字顯示，支援 Markdown 渲染（程式碼區塊、粗斜體）
- **BYOK 多供應商** — 支援任何 OpenAI 相容 API，每個對話框可獨立切換模型

## 📋 系統需求

- **瀏覽器**：Google Chrome（或 Chromium 系瀏覽器如 Edge、Brave），版本 88 以上（支援 Manifest V3）
- **API 供應商**：任何提供 OpenAI 相容 `/v1/chat/completions` 端點的服務（OpenAI、Groq、Together AI、OpenRouter 等）
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
2. 填入以下欄位：

| 欄位 | 說明 | 範例 |
|------|------|------|
| API Base URL | 供應商的 API 基礎位址（輸入後失焦自動補上 `/v1`） | `https://api.openai.com/v1` |
| API Key | 向供應商申請的金鑰（點擊右側 👁 圖示切換顯示） | `sk-xxxxxxxx` |
| 模型名稱 | 欲使用的模型 ID（可點擊「獲取」自動拉取列表） | `gpt-4o` |

3. （選用）新增快速預設問題，方便日後一鍵填入
4. （選用）勾選「預設釘住對話框」，讓新對話框自動固定
5. 設定自動儲存，無需手動點擊儲存按鈕

### 執行

設定完成後，在任意網頁上：

1. 用滑鼠劃選一段文字
2. 選取範圍右下方出現浮動 AI 圖示
3. 點擊圖示開啟對話框
4. 在輸入框輸入問題，按 `Enter` 發送

## 📖 使用說明

### 基本操作

| 操作 | 說明 |
|------|------|
| 劃選文字 → 點擊圖示 | 開啟對話框，選取內容作為上下文 |
| `Enter` | 發送訊息 |
| `Shift + Enter` | 輸入框內換行 |
| `ESC` | 關閉最上層未釘選的對話框 |
| 拖曳標題列 | 移動對話框位置 |
| 拖曳右下角 | 調整對話框大小 |
| 點擊 📌 釘選按鈕 | 固定對話框（點擊外部不關閉） |
| 點擊 × 關閉按鈕 | 關閉對話框 |

### 多對話框使用

- 可同時開啟多個對話框，每個維護獨立的對話歷史
- 新對話框以級聯偏移開啟，避免重疊
- 點擊任一對話框可將其移至最上層
- 每個對話框的標題列可獨立切換 AI 模型

### 右鍵選單

在任意頁面點擊右鍵，選擇「AI 劃詞助手」也能開啟對話框：
- 若有選取文字，自動帶入作為上下文
- 若無選取文字，開啟空白對話框直接提問

### 快速預設問題

在設定頁面可新增最多 10 個快速問題（如「翻譯成中文」「解釋這段程式碼」），對話框中會以晶片形式顯示，點擊即填入輸入框。

- **單擊**已存在的問題文字可直接編輯內容
- **拖曳**左側 ⠿ 把手可調整問題順序
- 點擊 × 按鈕刪除問題

## ⚙️ 設定檔說明

所有設定透過 `chrome.storage.sync` 同步，鍵值如下：

| 儲存鍵 | 說明 | 類型 | 預設值 |
|--------|------|------|--------|
| `apiKey` | API 金鑰 | string | — |
| `baseUrl` | API 基礎位址（自動補上 `/v1`） | string | — |
| `model` | 預設模型 ID | string | — |
| `quickPrompts` | 快速預設問題列表 | string[] | `[]` |
| `defaultPin` | 新對話框是否自動釘選 | boolean | `true` |

> 設定透過 Chrome 帳號同步，在不同裝置登入同一 Chrome 帳號即可共享設定。

## 🔌 API 介面

本擴充套件使用 OpenAI 相容的 API 介面，需確保供應商支援以下端點：

### 取得模型列表

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

### 對話補全（串流）

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
    { "type": "text", "text": "以下是用戶選取的圖片上下文：" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

> 若供應商不支援多模態（回傳 400），擴充套件會自動降級為純文字模式重試。

## ❓ 常見問題（FAQ）

**Q：對話框出現「請先設定 API Key」怎麼辦？**
A：點擊瀏覽器工具列的擴充套件圖示，在設定頁面填入 API Base URL、API Key 與模型名稱，儲存後即可使用。

**Q：支援哪些 AI 供應商？**
A：任何提供 OpenAI 相容 `/v1/chat/completions` 端點的供應商皆可，例如 OpenAI、Groq、Together AI、OpenRouter、Ollama（需開啟 API 服務）等。

**Q：選取的圖片無法發送？**
A：圖片提取受瀏覽器 CORS 策略限制，若圖片伺服器不允許跨域存取，該圖片會被靜默跳過。文字內容不受影響。

**Q：頁面重新整理後對話記錄會保留嗎？**
A：不會。目前對話歷史僅存在於記憶體中，頁面重新整理或關閉對話框後即清空。對話歷史持久化不在當前版本範圍內。

**Q：可以在 Firefox 或 Safari 使用嗎？**
A：目前僅支援 Chrome Manifest V3。Firefox 需調整 `manifest.json` 的 `browser_specific_settings`，Safari 需透過 Xcode 包裝，均不在當前支援範圍。

**Q：API Key 安全嗎？**
A：API Key 僅儲存於 `chrome.storage.sync`，不會透過 URL 參數傳輸。所有對話內容在使用者瀏覽器與 API 供應商之間直接傳輸，不經過第三方伺服器。

**Q：API Base URL 需要包含 `/v1` 嗎？**
A：不需要。輸入框失焦時會自動偵測，若結尾沒有版本路徑（如 `/v1`、`/v2`）則自動補上 `/v1`。例如輸入 `https://api.openai.com` 會自動修正為 `https://api.openai.com/v1`。

## 🤝 貢獻指南

1. Fork 此專案
2. 建立功能分支：`git checkout -b feature/your-feature`
3. 遵循以下開發規範：
   - 所有 UI 文字使用繁體中文（zh-TW）
   - Content script 的 CSS class 必須加上 `__aiext_` 前綴
   - 所有注入的 DOM 元素必須設定 `data-aiext="1"` 屬性
   - 維持純 Vanilla JS，不引入框架或打包工具
4. 提交變更：`git commit -m "feat: your feature"`
5. 發起 Pull Request

詳細開發指引請參閱 [AGENTS.md](AGENTS.md)。

## 🔗 相關連結

- [GitHub Repository](https://github.com/mch000534/ai-selector-extension)
- [Chrome Web Store](https://chromewebstore.google.com/detail/ddlpfggfmhfhkdlebijpihjbcfkbnlmm)

## 📄 授權

MIT License
