# 山風童軍團 Line官方網站 Login 狀態儀錶板 Design

## Goal

Build a GitHub Pages friendly static dashboard for viewing private Google Sheet login data through a token-protected Google Apps Script proxy.

## Data Source

- Spreadsheet ID: `1YKUInNATvHY1VNoFngw0NmROjkn1uSC-fX3iyOK0qgk`
- Sheet gid: `941682732`
- Timestamp column: `timestamp`
- Unique user column: `lineUserId`
- Time zone: `Asia/Taipei`

## Architecture

The browser app is a pure HTML/CSS/JavaScript static site. It calls a deployed Google Apps Script Web App with a `token` query parameter. The Apps Script validates the token from Script Properties, reads the private spreadsheet with deployer permissions, and returns only the fields needed by the dashboard.

The front end normalizes rows, computes distinct `lineUserId` counts by date and by hour, and renders two combo charts:

- Daily chart: daily bar count plus cumulative trend.
- Hourly chart: shown after selecting a date, hourly bar count plus same-day cumulative trend.

## Security

The Google Sheet stays private. The Apps Script Web App is the only component with read access. The static front end can contain a token, so the token is treated as lightweight access control rather than a secret. The proxy returns only `timestamp` and `lineUserId` rows, not the whole sheet.

## Visual Direction

The interface uses a near-white background, quiet cards, soft shadows, pale Google-like accent colors, lightweight line icons, and responsive chart panels. The first screen is the dashboard itself, with no marketing landing page.

## Deployment

1. Deploy `apps-script/Code.gs` as a Google Apps Script Web App.
2. Set Script Properties: `DASHBOARD_TOKEN`, `SPREADSHEET_ID`, and optional `SHEET_NAME`.
3. Share the private Sheet with the script deployer account if needed.
4. Set `assets/js/config.js` with the Web App URL and token.
5. Push the static files to `Iven00/ST_Line_Login_Deshboard.git`.
6. Enable GitHub Pages from the repository's main branch.
