# 山風童軍團 Line官方網站 Login 狀態儀錶板

純 HTML/CSS/JS dashboard，用 GitHub Pages 顯示私人 Google Sheet 中的 LINE Login 統計資料。

## 架構

- GitHub Pages：顯示 dashboard。
- Google Apps Script：使用 token 驗證後讀取私人 Google Sheet。
- Google Sheet：保持私人，不需要公開成任何人可讀。

統計欄位：

- 時間欄位：`timestamp`
- 不重複欄位：`lineUserId`
- 濾除帳號欄位：`displayName`
- 時區：`Asia/Taipei`

## Google Apps Script 設定

1. 建立 Google Apps Script 專案。
2. 將 `apps-script/Code.gs` 的內容貼到 Apps Script 編輯器。
3. 到「專案設定」新增 Script Properties：

| Key | Value |
| --- | --- |
| `DASHBOARD_TOKEN` | 自訂一組長 token |
| `SPREADSHEET_ID` | `1YKUInNATvHY1VNoFngw0NmROjkn1uSC-fX3iyOK0qgk` |
| `SHEET_NAME` | 可選，若不填會讀第一個工作表 |

4. 部署為 Web App：
   - Execute as：Me
   - Who has access：Anyone
5. 複製 Web App URL。

如果 Apps Script 使用的帳號不能讀取該 Sheet，請將 Sheet 共用給該 Google 帳號。若改用服務帳號，請只在後端或 Apps Script 端使用，不要把金鑰放進 GitHub Pages。

## 前端設定

編輯 `assets/js/config.js`：

```js
window.DASHBOARD_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  token: 'YOUR_DASHBOARD_TOKEN',
  refreshMinutes: 10
};
```

未設定 URL 時，頁面會使用展示資料，方便先檢查版面。

## 濾除帳號

Dashboard 會從 Apps Script 回傳的 `displayName` 建立「濾除帳號」清單。勾選的帳號會從摘要卡片、每日圖表、每小時圖表中排除。設定會存在目前瀏覽器的 `localStorage`，下次開啟同一個 dashboard 會自動套用。

目前濾除條件會同步存到同一份 Google Sheet 的 `工作表1` 頁籤，讓所有使用者共用。Apps Script 會在該頁籤追加或更新一列：

| 欄位 A | 欄位 B | 欄位 C |
| --- | --- | --- |
| `__dashboard_excluded_display_names__` | JSON 格式的 displayName 陣列 | 更新時間 |

這列不會有 `timestamp` 或 `lineUserId`，所以 dashboard 讀取登入資料時會自動忽略它。

更新 `apps-script/Code.gs` 後，請到 Apps Script 重新部署 Web App；若只改本機前端但沒有重新部署 Apps Script，API 不會回傳 `displayName` 或共用濾除設定。

## GitHub Pages 部署

1. 將本專案推到 `Iven00/ST_Line_Login_Deshboard.git`。
2. 到 GitHub repo 的 Settings。
3. 進入 Pages。
4. Source 選擇 `Deploy from a branch`。
5. Branch 選擇 `main`，資料夾選 `/root`。
6. 儲存後等待 GitHub Pages 完成部署。

## 本機測試

安裝相依套件不是必要條件，目前只使用 Node 內建測試工具。

```powershell
npm test
```

啟動本機預覽：

```powershell
npx http-server . -p 4173 -c-1
```

開啟 `http://localhost:4173`。
