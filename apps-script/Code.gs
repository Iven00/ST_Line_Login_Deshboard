const DEFAULT_TIME_ZONE = 'Asia/Taipei';
const REQUIRED_COLUMNS = {
  timestamp: 'timestamp',
  lineUserId: 'lineUserId',
};

function doGet(event) {
  try {
    validateToken_(event);
    const rows = readRows_();

    return json_({
      status: 'ok',
      timeZone: DEFAULT_TIME_ZONE,
      rows,
      generatedAt: Utilities.formatDate(new Date(), DEFAULT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss'+08:00'"),
    });
  } catch (error) {
    return json_({
      status: 'error',
      message: error.message || 'Unknown error',
    }, 400);
  }
}

function validateToken_(event) {
  const expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_TOKEN');
  const actual = event && event.parameter && event.parameter.token;

  if (!expected) {
    throw new Error('DASHBOARD_TOKEN is not configured.');
  }

  if (actual !== expected) {
    throw new Error('Invalid token.');
  }
}

function readRows_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID') || '1YKUInNATvHY1VNoFngw0NmROjkn1uSC-fX3iyOK0qgk';
  const sheetName = properties.getProperty('SHEET_NAME');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];

  if (!sheet) {
    throw new Error('Sheet not found.');
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((value) => String(value).trim());
  const columnIndexes = findColumnIndexes_(headers);

  return values.slice(1)
    .map((row) => {
      const timestamp = row[columnIndexes.timestamp];
      const lineUserId = String(row[columnIndexes.lineUserId] || '').trim();

      if (!timestamp || !lineUserId) {
        return null;
      }

      return {
        timestamp: formatTimestamp_(timestamp),
        lineUserId,
      };
    })
    .filter(Boolean);
}

function findColumnIndexes_(headers) {
  const lowerHeaders = headers.map((header) => header.toLowerCase());
  const timestamp = lowerHeaders.indexOf(REQUIRED_COLUMNS.timestamp.toLowerCase());
  const lineUserId = lowerHeaders.indexOf(REQUIRED_COLUMNS.lineUserId.toLowerCase());

  if (timestamp === -1 || lineUserId === -1) {
    throw new Error('Required columns timestamp and lineUserId were not found.');
  }

  return { timestamp, lineUserId };
}

function formatTimestamp_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, DEFAULT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  }

  return String(value).trim();
}

function json_(payload, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
