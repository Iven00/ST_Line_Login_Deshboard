const DEFAULT_TIME_ZONE = 'Asia/Taipei';
const FILTER_SETTINGS_SHEET_NAME = '\u5de5\u4f5c\u88681';
const FILTER_SETTINGS_KEY = '__dashboard_excluded_display_names__';
const REQUIRED_COLUMNS = {
  timestamp: 'timestamp',
  lineUserId: 'lineUserId',
  displayName: 'displayName',
};

function doGet(event) {
  try {
    validateToken_(event);

    if (event && event.parameter && event.parameter.action === 'saveFilters') {
      const settings = writeFilterSettings_(parseDisplayNameList_(event.parameter.excludedDisplayNames));

      return json_({
        status: 'ok',
        settings,
        generatedAt: Utilities.formatDate(new Date(), DEFAULT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss'+08:00'"),
      });
    }

    const rows = readRows_();
    const settings = readFilterSettings_();

    return json_({
      status: 'ok',
      timeZone: DEFAULT_TIME_ZONE,
      rows,
      settings,
      generatedAt: Utilities.formatDate(new Date(), DEFAULT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss'+08:00'"),
    });
  } catch (error) {
    return json_({
      status: 'error',
      message: error.message || 'Unknown error',
    }, 400);
  }
}

function doPost(event) {
  try {
    validateToken_(event);
    const body = parseBody_(event);
    const action = String(body.action || '').trim();

    if (action !== 'saveFilters') {
      throw new Error('Unsupported action.');
    }

    const settings = writeFilterSettings_(body.excludedDisplayNames);

    return json_({
      status: 'ok',
      settings,
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
      const displayName = columnIndexes.displayName === -1 ? '' : String(row[columnIndexes.displayName] || '').trim();

      if (!timestamp || !lineUserId) {
        return null;
      }

      return {
        timestamp: formatTimestamp_(timestamp),
        lineUserId,
        displayName,
      };
    })
    .filter(Boolean);
}

function readFilterSettings_() {
  const sheet = getFilterSettingsSheet_();
  const values = sheet.getDataRange().getValues();

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0]).trim() === FILTER_SETTINGS_KEY) {
      return {
        excludedDisplayNames: parseDisplayNameList_(values[rowIndex][1]),
        updatedAt: String(values[rowIndex][2] || ''),
      };
    }
  }

  return {
    excludedDisplayNames: [],
    updatedAt: '',
  };
}

function writeFilterSettings_(displayNames) {
  const sheet = getFilterSettingsSheet_();
  const names = normalizeDisplayNameList_(displayNames);
  const values = sheet.getDataRange().getValues();
  const updatedAt = Utilities.formatDate(new Date(), DEFAULT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  const rowValues = [FILTER_SETTINGS_KEY, JSON.stringify(names), updatedAt];

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0]).trim() === FILTER_SETTINGS_KEY) {
      sheet.getRange(rowIndex + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return {
        excludedDisplayNames: names,
        updatedAt,
      };
    }
  }

  sheet.appendRow(rowValues);
  return {
    excludedDisplayNames: names,
    updatedAt,
  };
}

function getFilterSettingsSheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID') || '1YKUInNATvHY1VNoFngw0NmROjkn1uSC-fX3iyOK0qgk';
  const sheetName = properties.getProperty('FILTER_SHEET_NAME') || FILTER_SETTINGS_SHEET_NAME;
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function parseBody_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON body.');
  }
}

function parseDisplayNameList_(value) {
  if (!value) {
    return [];
  }

  try {
    return normalizeDisplayNameList_(JSON.parse(String(value)));
  } catch (error) {
    return [];
  }
}

function normalizeDisplayNameList_(displayNames) {
  if (!Array.isArray(displayNames)) {
    return [];
  }

  const seen = {};
  const names = [];

  displayNames.forEach((name) => {
    if (typeof name !== 'string') {
      return;
    }

    const trimmed = name.trim();
    if (!trimmed || seen[trimmed]) {
      return;
    }

    seen[trimmed] = true;
    names.push(trimmed);
  });

  return names;
}

function findColumnIndexes_(headers) {
  const lowerHeaders = headers.map((header) => header.toLowerCase());
  const timestamp = lowerHeaders.indexOf(REQUIRED_COLUMNS.timestamp.toLowerCase());
  const lineUserId = lowerHeaders.indexOf(REQUIRED_COLUMNS.lineUserId.toLowerCase());
  const displayName = lowerHeaders.indexOf(REQUIRED_COLUMNS.displayName.toLowerCase());

  if (timestamp === -1 || lineUserId === -1) {
    throw new Error('Required columns timestamp and lineUserId were not found.');
  }

  return { timestamp, lineUserId, displayName };
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
