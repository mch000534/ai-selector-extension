# AI 劃詞助手 — 手動驗收測試案例

> 對應 `docs/requirements.md`（FR-001～FR-016、FR-010a～FR-010d）與各階段實作。
> 自動化測試（`node --test tests/*.test.js`，109 個）須先全過，本文件只覆蓋需瀏覽器的部分。
> 結果欄請填 通過 / 失敗 / 略過（註明原因）。

## 0. 環境與前置

- Chrome（建議 Canary/Stable 最新版），`chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選 `shrimp/`。
- 準備金鑰（至少一組 OpenAI 相容；測 4.2 另需 Anthropic、Gemini）：可使用免費額度供應商（Groq、Mistral、Gemini AI Studio）。
- 測試用分頁：含文字的文章頁、含多張圖片的頁面、`example.com`（乾淨頁）。
- 每次改 code 後：擴充套件卡片按重新載入 → 測試分頁整頁重整。

| ID | 需求 | 前置 | 步驟 | 預期 | 結果 |
|---|---|---|---|---|---|
| TC-001 | FR-009/014/015 | 全新安裝 | 開 popup，填 Base URL（不帶 `/v1`）、Key、模型後失焦 | URL 自動補 `/v1` 並儲存；眼圖示可切換顯示 | |
| TC-002 | FR-009 | TC-001 後 | 逐字修改 API Key，開 Conversations 管理器查看 | 對話紀錄**不**被清空 | |
| TC-003 | FR-009 | TC-001 後 | 改 Base URL 或 Key 為另一組有效值 | 已存對話被清空（屬正常：endpoint 變更） | |
| TC-004 | 4.1 profiles | 有一組設定 | 按 Save current → 改欄位成第二家 → 再 Save → 下拉切換兩者 | 切換即套用並可直接對話；同 endpoint 重存不產生重複 | |
| TC-005 | 4.1 profiles | 有設定檔 | 刪設定檔、重開 popup | 首次自動以目前連線種回一個 | |
| TC-006 | 4.1 key遷移 | 舊版升級情境（或手動在 sync 塞 `apiKey`） | 開 popup → 檢查 `chrome.storage` | key 被搬到 local，sync 副本清除；對話功能正常 | |
| TC-007 | FR-001 | 任意文章頁 | 劃詞 / 只框圖片 / 已有未釘選對話時再劃詞 | 右下角出圖示、邊緣翻轉；純圖也出；有未釘選對話時不出新圖示 | |
| TC-008 | FR-002/005 | 有效 key | 劃一段文字開對話框送出 | 串流逐字出現、自動滾底、Markdown（粗體/程式碼/連結）正確渲染 | |
| TC-009 | FR-002 | 含圖頁面 | 框含 2 張圖的範圍送出 | 使用者訊息出現縮圖列；AI 回覆正常 | |
| TC-010 | 4.4 | 一輪對話後 | hover 訊息 | user 有 Edit/Regenerate，assistant 有 Regenerate/Copy；Copy 後按鈕變 ✓ | |
| TC-011 | 4.4 | 多輪對話 | 編輯第 1 則 user 訊息並存檔 | 之後訊息消失、按新文字重發（無分支） | |
| TC-012 | 4.4 | 多輪對話 | 對第 1 則按 Regenerate；對 assistant 按 Regenerate | 分別從該 user 重跑 / 回溯到最近 user 重跑 | |
| TC-013 | FR-011 | 有效 key | 關網路送訊息；輸錯 key 送訊息 | 重試提示→錯誤訊息；401/錯誤顯示狀態碼+前 200 字 | |
| TC-014 | FR-011 | 有圖對話 | 用不支援圖的模型送圖 | 400 後自動轉純文字重試成功 | |
| TC-015 | P0 overlay | 有未關對話 | 重載頁面 | 頁面可正常點擊；對話框為釘選態、無透明遮罩擋點擊 | |
| TC-016 | FR-003/004 | — | 連開 3 對話框：拖曳、拉大、釘選/取消、ESC、點遮罩關閉 | 級聯偏移、z 順序正確、尺寸重載後保留、小視窗（<500px）無溢出 | |
| TC-017 | FR-007 | 有效 key | 改標題列模型 → 送訊息；開新對話框 | 該對話框用新模型；token 列 window 隨模型變 | |
| TC-018 | FR-010a | 劃詞後 | popup 按 Open drawer；浮動↔抽屜互轉；resize 視窗 | 抽屜貼邊全高、body 留白、resize 後留白重算 | |
| TC-019 | FR-008/4.5 | 選一段文字按右鍵 | 檢查選單：前 5 prompts + 6 內建動作（無子選單）；不選取時只剩開啟項 | 逐一點 Translate/Explain/Summarize/Polish/繁簡轉換/Tutorial，對話框開啟且輸入框已填好 prompt | |
| TC-020 | 4.5 | popup | 取消勾選 1 個內建動作 → 回頁面重開選單；全取消 | 即時消失；全取消後該區不出現 | |
| TC-021 | FR-010 | — | `Alt+Shift+A`、`Alt+Shift+D`；到 `chrome://extensions/shortcuts` 改鍵 | 開 popup / 開抽屜；改鍵生效 | |
| TC-022 | FR-010b | 累積數筆對話（含關閉） | 開 Conversations：搜尋關鍵字、點標題改名、重載確認改名保留 | 搜尋比對標題/預覽/host/模型；改名持久 | |
| TC-023 | FR-010b | 同上 | 匯出 MD/JSON/複製 MD；單刪；勾選批次刪；還原已關閉 | 檔名正常、MD 含對話；刪除即消失；還原在目前分頁重開 | |
| TC-024 | FR-010d 圖片 | 對話框 | 截圖→框選→送出前重載頁面 | pending 截圖恢復預覽 | |
| TC-025 | FR-010d 圖片 | 有縮圖時 | 點縮圖/選取圖 → 燈箱；ESC/點擊關；拖圖片檔進對話框 | 放大顯示；拖放加入 pending（超 4 張提示） | |
| TC-026 | FR-010c | 長對話（或把模型改小） | 看 token 列；衝到 90%+ | `≈x / y (z%)` 更新；80% 變紅；90% 出現壓縮鈕，按下後舊對話壓成摘要 | |
| TC-027 | 4.2 adapter | Anthropic key | Base URL 切 `https://api.anthropic.com` 對話一輪（含圖一問） | 正常串流；圖片走 base64 或自動 fallback 純文字 | |
| TC-028 | 4.2 adapter | Gemini key | Base URL 切 `https://generativelanguage.googleapis.com` 對話一輪 | 正常串流；Fetch 模型列表顯示去前綴名稱 | |
| TC-029 | FR-012 | — | Chrome 语言切中文/阿拉伯文，重開 popup + 對話框 | 字串翻譯、RTL 版面正常；切回英文正常 | |
| TC-030 | FR-013/010d | 系統深淺色切換；開 reduced-motion | popup + 對話框配色跟隨；動畫停止 | 無白底殘留、無動畫 | |
| TC-031 | 注入 robustness | SPA 站（如 Gmail/Notion）前後導航 | 劃詞功能仍在；context 不殘留舊頁 | 導航後選取為新頁內容 | |
| TC-032 | P0 XSS | — | model 填 `"><img src=x onerror=alert(1)>` 開對話框 | 不彈窗，純文字顯示 | |
| TC-033 | 設定匯出入 | 有 profiles+prompts | Export → 改檔（改 model 名）→ Import | 匯出檔無 apiKey；匯入成功、欄位更新、popup 重載 | |
| TC-034 | 斷流 | 有效 key | 送長回覆問題，中途可觀察截斷提示時（或用弱網） | 若出現「可能截斷」提示，Regenerate 可重試 | |

## 備註

- TC-015/TC-032 為 P0 安全回歸，任一版本必跑。
- TC-006 升級路徑：如無舊版環境，可用 `chrome.storage.sync.set({apiKey:'x'})` + 清 local 後模擬。
- 已知限制（不視為失敗）：刪除「開啟中」對話的紀錄後，該分頁下次 persist 會重建；pushState 型 SPA 導航不重置 context；`host_permissions` 與 `providers.json` 對外開放為刻意保留（content script 跨域 fetch 與 `getURL` 所需）。
