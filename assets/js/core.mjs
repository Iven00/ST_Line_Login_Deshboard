const DASHBOARD_TIME_ZONE = 'Asia/Taipei';

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

export function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const timestamp = parseTimestamp(row?.timestamp);
      const lineUserId = String(row?.lineUserId ?? '').trim();

      if (!timestamp || !lineUserId) {
        return null;
      }

      return {
        timestamp,
        timestampText: timestamp.toISOString(),
        lineUserId,
        dateKey: toDateKey(timestamp),
        hourKey: toHourKey(timestamp)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
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

export function groupHourlyForDate(rows, dateKey) {
  const buckets = new Map();

  for (const row of rows) {
    if (row.dateKey !== dateKey) {
      continue;
    }

    if (!buckets.has(row.hourKey)) {
      buckets.set(row.hourKey, new Set());
    }

    buckets.get(row.hourKey).add(row.lineUserId);
  }

  return toSeries(buckets);
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
