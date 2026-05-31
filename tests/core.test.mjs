import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSummary,
  groupDaily,
  groupHourlyForDate,
  normalizeRows
} from '../assets/js/core.mjs';

const rows = [
  { timestamp: '2026-05-29T23:30:00+08:00', lineUserId: 'U001' },
  { timestamp: '2026-05-29T23:45:00+08:00', lineUserId: 'U001' },
  { timestamp: '2026-05-30T08:05:00+08:00', lineUserId: 'U001' },
  { timestamp: '2026-05-30T08:15:00+08:00', lineUserId: 'U002' },
  { timestamp: '2026-05-30T09:00:00+08:00', lineUserId: 'U002' },
  { timestamp: '2026-05-31T10:00:00+08:00', lineUserId: 'U003' },
  { timestamp: '', lineUserId: 'ignored' },
  { timestamp: 'not a date', lineUserId: 'ignored2' },
  { timestamp: '2026-05-31T10:10:00+08:00', lineUserId: '' }
];

test('normalizeRows drops invalid rows and preserves valid login records', () => {
  const normalized = normalizeRows(rows);

  assert.equal(normalized.length, 6);
  assert.equal(normalized[0].lineUserId, 'U001');
  assert.equal(normalized[0].dateKey, '2026-05-29');
  assert.equal(normalized[0].hourKey, '23:00');
});

test('groupDaily counts distinct line users by date and builds cumulative trend', () => {
  const daily = groupDaily(normalizeRows(rows));

  assert.deepEqual(daily, [
    { key: '2026-05-29', label: '05/29', count: 1, cumulative: 1 },
    { key: '2026-05-30', label: '05/30', count: 2, cumulative: 3 },
    { key: '2026-05-31', label: '05/31', count: 1, cumulative: 4 }
  ]);
});

test('groupHourlyForDate counts distinct line users within the selected day', () => {
  const hourly = groupHourlyForDate(normalizeRows(rows), '2026-05-30');

  assert.deepEqual(hourly, [
    { key: '08:00', label: '08:00', count: 2, cumulative: 2 },
    { key: '09:00', label: '09:00', count: 1, cumulative: 3 }
  ]);
});

test('buildSummary returns totals and latest timestamp for dashboard cards', () => {
  const summary = buildSummary(normalizeRows(rows));

  assert.equal(summary.totalRows, 6);
  assert.equal(summary.uniqueUsers, 3);
  assert.equal(summary.latestDateKey, '2026-05-31');
  assert.equal(summary.days, 3);
});
