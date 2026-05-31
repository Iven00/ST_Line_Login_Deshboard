const DASHBOARD_TIME_ZONE = 'Asia/Taipei';
const UNKNOWN_DISPLAY_NAME = '未命名帳號';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DASHBOARD_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function partsToObject(parts) {
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toDateKey(date) {
  const parts = partsToObject(dateFormatter.formatToParts(date));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toHourKey(date) {
  const parts = partsToObject(hourFormatter.formatToParts(date));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${hour}:00`;
}

function toLabel(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${month}/${day}`;
}

function toShortHourLabel(hourKey) {
  return hourKey.slice(0, 2);
}

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\//g, '-')
    .replace('上午', 'AM')
    .replace('下午', 'PM');

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toSeries(map, labelForKey = (key) => key) {
  let cumulative = 0;

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, userIds]) => {
      const count = userIds.size;
      cumulative += count;

      return {
        key,
        label: labelForKey(key),
        count,
        cumulative
      };
    });
}

function createHourlyBuckets() {
  return Array.from({ length: 24 }, (_, hour) => {
    const key = `${String(hour).padStart(2, '0')}:00`;
    return [key, new Set()];
  });
}

export function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const timestamp = parseTimestamp(row?.timestamp);
      const lineUserId = String(row?.lineUserId ?? '').trim();
      const displayName = String(row?.displayName ?? '').trim() || UNKNOWN_DISPLAY_NAME;

      if (!timestamp || !lineUserId) {
        return null;
      }

      return {
        timestamp,
        timestampText: timestamp.toISOString(),
        lineUserId,
        displayName,
        dateKey: toDateKey(timestamp),
        hourKey: toHourKey(timestamp)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeRegistrationRows(rows, idKeys) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const timestamp = parseTimestamp(row?.timestamp ?? row?.['時間戳記']);
      const lineUserId = String(idKeys.reduce((value, key) => value ?? row?.[key], null) ?? '').trim();

      if (!timestamp || !lineUserId) {
        return null;
      }

      return {
        timestamp,
        timestampText: timestamp.toISOString(),
        lineUserId,
        displayName: lineUserId,
        dateKey: toDateKey(timestamp),
        hourKey: toHourKey(timestamp)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function normalizeChildRows(rows) {
  return normalizeRegistrationRows(rows, ['childId', '孩童身分證字號']);
}

export function normalizeExperienceRows(rows) {
  return normalizeRegistrationRows(rows, ['participantName', '參與者姓名']);
}

export function getDisplayNameOptions(rows) {
  const names = new Map();

  for (const row of rows) {
    if (!names.has(row.displayName)) {
      names.set(row.displayName, new Set());
    }

    names.get(row.displayName).add(row.lineUserId);
  }

  return [...names.entries()]
    .map(([name, lineUserIds]) => ({ name, count: lineUserIds.size }))
    .sort((a, b) => {
      if (a.name === UNKNOWN_DISPLAY_NAME) return 1;
      if (b.name === UNKNOWN_DISPLAY_NAME) return -1;
      return a.name.localeCompare(b.name, 'zh-Hant-TW');
    });
}

export function filterRowsByExcludedDisplayNames(rows, excludedDisplayNames) {
  if (!excludedDisplayNames || excludedDisplayNames.size === 0) {
    return rows;
  }

  return rows.filter((row) => !excludedDisplayNames.has(row.displayName));
}

export function normalizeDisplayNameList(names) {
  if (!Array.isArray(names)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const name of names) {
    if (typeof name !== 'string') {
      continue;
    }

    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function groupDaily(rows) {
  const buckets = new Map();

  for (const row of rows) {
    if (!buckets.has(row.dateKey)) {
      buckets.set(row.dateKey, new Set());
    }

    buckets.get(row.dateKey).add(row.lineUserId);
  }

  return toSeries(buckets, toLabel);
}

export function groupHourlyForDate(rows, dateKey, options = {}) {
  const buckets = new Map(createHourlyBuckets());

  for (const row of rows) {
    if (row.dateKey !== dateKey) {
      continue;
    }

    if (!buckets.has(row.hourKey)) {
      buckets.set(row.hourKey, new Set());
    }

    buckets.get(row.hourKey).add(row.lineUserId);
  }

  return toSeries(buckets, options.shortHourLabel ? toShortHourLabel : (key) => key);
}

export function combineSeries(primarySeries, secondarySeries = [], experienceSeries = []) {
  const secondaryByKey = new Map(secondarySeries.map((item) => [item.key, item]));
  const experienceByKey = new Map(experienceSeries.map((item) => [item.key, item]));
  const primaryByKey = new Map(primarySeries.map((item) => [item.key, item]));
  const keys = [...new Set([
    ...primarySeries.map((item) => item.key),
    ...secondarySeries.map((item) => item.key),
    ...experienceSeries.map((item) => item.key)
  ])]
    .sort((a, b) => a.localeCompare(b));
  let primaryCumulative = 0;
  let secondaryCumulative = 0;
  let experienceCumulative = 0;

  return keys.map((key) => {
    const primary = primaryByKey.get(key);
    const secondary = secondaryByKey.get(key);
    const experience = experienceByKey.get(key);
    primaryCumulative += primary?.count ?? 0;
    secondaryCumulative += secondary?.count ?? 0;
    experienceCumulative += experience?.count ?? 0;

    return {
      key,
      label: primary?.label ?? secondary?.label ?? experience?.label ?? key,
      count: primary?.count ?? 0,
      secondaryCount: secondary?.count ?? 0,
      experienceCount: experience?.count ?? 0,
      cumulative: primaryCumulative,
      secondaryCumulative,
      experienceCumulative
    };
  });
}

export function buildSummary(rows) {
  const userIds = new Set(rows.map((row) => row.lineUserId));
  const dateKeys = new Set(rows.map((row) => row.dateKey));
  const latest = rows.at(-1);

  return {
    totalRows: rows.length,
    uniqueUsers: userIds.size,
    days: dateKeys.size,
    latestDateKey: latest?.dateKey ?? ''
  };
}

export function prepareDashboard(rows) {
  const normalized = normalizeRows(rows);
  const daily = groupDaily(normalized);
  const selectedDate = daily.at(-1)?.key ?? '';

  return {
    rows: normalized,
    daily,
    hourly: selectedDate ? groupHourlyForDate(normalized, selectedDate) : [],
    selectedDate,
    summary: buildSummary(normalized)
  };
}
