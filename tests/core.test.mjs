import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSummary,
  combineSeries,
  filterRowsByExcludedDisplayNames,
  getDisplayNameOptions,
  groupDaily,
  groupHourlyForDate,
  normalizeChildRows,
  normalizeExperienceRows,
  normalizeDisplayNameList,
  normalizeRows
} from '../assets/js/core.js';

const rows = [
  { timestamp: '2026-05-29T23:30:00+08:00', lineUserId: 'U001', displayName: 'Alpha' },
  { timestamp: '2026-05-29T23:45:00+08:00', lineUserId: 'U001', displayName: 'Alpha' },
  { timestamp: '2026-05-30T08:05:00+08:00', lineUserId: 'U001', displayName: 'Alpha' },
  { timestamp: '2026-05-30T08:15:00+08:00', lineUserId: 'U002', displayName: 'Beta' },
  { timestamp: '2026-05-30T09:00:00+08:00', lineUserId: 'U002', displayName: 'Beta' },
  { timestamp: '2026-05-31T10:00:00+08:00', lineUserId: 'U003', displayName: '' },
  { timestamp: '', lineUserId: 'ignored' },
  { timestamp: 'not a date', lineUserId: 'ignored2' },
  { timestamp: '2026-05-31T10:10:00+08:00', lineUserId: '' }
];

const childRows = [
  { timestamp: '2026-05-30T08:05:00+08:00', childId: 'A123' },
  { timestamp: '2026-05-30T08:15:00+08:00', childId: 'A123' },
  { timestamp: '2026-05-30T09:15:00+08:00', childId: 'B456' },
  { timestamp: '2026-05-31T10:00:00+08:00', childId: 'C789' }
];

const experienceRows = [
  { timestamp: '2026-05-30T08:20:00+08:00', participantName: 'Neo' },
  { timestamp: '2026-05-30T08:25:00+08:00', participantName: 'Neo' },
  { timestamp: '2026-05-30T10:15:00+08:00', participantName: 'Trinity' },
  { timestamp: '2026-05-31T11:00:00+08:00', participantName: 'Morpheus' },
  { timestamp: '2026-06-01T11:00:00+08:00', participantName: 'Smith' }
];

test('normalizeRows drops invalid rows and preserves valid login records', () => {
  const normalized = normalizeRows(rows);

  assert.equal(normalized.length, 6);
  assert.equal(normalized[0].lineUserId, 'U001');
  assert.equal(normalized[0].displayName, 'Alpha');
  assert.equal(normalized[0].dateKey, '2026-05-29');
  assert.equal(normalized[0].hourKey, '23:00');
});

test('normalizeChildRows accepts alternate timestamp and child id headers', () => {
  const normalized = normalizeChildRows([
    { '時間戳記': '2026-05-30T08:05:00+08:00', '孩童身分證字號': 'A123' },
    { '時間戳記': '2026-05-30T08:15:00+08:00', '孩童身分證字號': 'A123' },
    { '時間戳記': '', '孩童身分證字號': 'ignored' }
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].lineUserId, 'A123');
  assert.equal(normalized[0].dateKey, '2026-05-30');
  assert.equal(normalized[0].hourKey, '08:00');
});

test('normalizeExperienceRows accepts timestamp and participant name headers', () => {
  const normalized = normalizeExperienceRows([
    { '\u6642\u9593\u6233\u8a18': '2026-05-30T08:05:00+08:00', '\u53c3\u8207\u8005\u59d3\u540d': 'Neo' },
    { '\u6642\u9593\u6233\u8a18': '2026-05-30T08:15:00+08:00', '\u53c3\u8207\u8005\u59d3\u540d': 'Neo' },
    { '\u6642\u9593\u6233\u8a18': '', '\u53c3\u8207\u8005\u59d3\u540d': 'ignored' }
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].lineUserId, 'Neo');
  assert.equal(normalized[0].dateKey, '2026-05-30');
  assert.equal(normalized[0].hourKey, '08:00');
});

test('getDisplayNameOptions returns sorted names and a fallback for blank displayName', () => {
  const options = getDisplayNameOptions(normalizeRows(rows));

  assert.deepEqual(options, [
    { name: 'Alpha', count: 1 },
    { name: 'Beta', count: 1 },
    { name: '未命名帳號', count: 1 }
  ]);
});

test('filterRowsByExcludedDisplayNames removes every line user with a selected displayName', () => {
  const normalized = normalizeRows([
    ...rows,
    { timestamp: '2026-05-31T11:00:00+08:00', lineUserId: 'U004', displayName: 'Beta' }
  ]);
  const filtered = filterRowsByExcludedDisplayNames(normalized, new Set(['Beta', '未命名帳號']));

  assert.deepEqual([...new Set(filtered.map((row) => row.lineUserId))], ['U001']);
});

test('normalizeDisplayNameList trims names, removes blanks, and deduplicates values', () => {
  const names = normalizeDisplayNameList([' Beta ', '', 'Alpha', 'Beta', null, 42]);

  assert.deepEqual(names, ['Beta', 'Alpha']);
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

  assert.equal(hourly.length, 24);
  assert.deepEqual(hourly.slice(8, 10), [
    { key: '08:00', label: '08:00', count: 2, cumulative: 2 },
    { key: '09:00', label: '09:00', count: 1, cumulative: 3 }
  ]);
  assert.deepEqual(hourly.slice(10, 13), [
    { key: '10:00', label: '10:00', count: 0, cumulative: 3 },
    { key: '11:00', label: '11:00', count: 0, cumulative: 3 },
    { key: '12:00', label: '12:00', count: 0, cumulative: 3 }
  ]);
});

test('combineSeries merges primary and secondary counts by key', () => {
  const lineDaily = groupDaily(normalizeRows(rows));
  const childDaily = groupDaily(normalizeChildRows(childRows));
  const experienceDaily = groupDaily(normalizeExperienceRows(experienceRows));
  const combined = combineSeries(lineDaily, childDaily, experienceDaily);

  assert.deepEqual(combined, [
    { key: '2026-05-29', label: '05/29', count: 1, secondaryCount: 0, experienceCount: 0, cumulative: 1, secondaryCumulative: 0, experienceCumulative: 0 },
    { key: '2026-05-30', label: '05/30', count: 2, secondaryCount: 2, experienceCount: 2, cumulative: 3, secondaryCumulative: 2, experienceCumulative: 2 },
    { key: '2026-05-31', label: '05/31', count: 1, secondaryCount: 1, experienceCount: 1, cumulative: 4, secondaryCumulative: 3, experienceCumulative: 3 },
    { key: '2026-06-01', label: '06/01', count: 0, secondaryCount: 0, experienceCount: 1, cumulative: 4, secondaryCumulative: 3, experienceCumulative: 4 }
  ]);
});

test('combineSeries keeps hourly short labels for the second chart and merges experience counts', () => {
  const lineHourly = groupHourlyForDate(normalizeRows(rows), '2026-05-30', { shortHourLabel: true });
  const childHourly = groupHourlyForDate(normalizeChildRows(childRows), '2026-05-30', { shortHourLabel: true });
  const experienceHourly = groupHourlyForDate(normalizeExperienceRows(experienceRows), '2026-05-30', { shortHourLabel: true });
  const combined = combineSeries(lineHourly, childHourly, experienceHourly);

  assert.equal(combined.length, 24);
  assert.deepEqual(combined.slice(8, 10), [
    { key: '08:00', label: '08', count: 2, secondaryCount: 1, experienceCount: 1, cumulative: 2, secondaryCumulative: 1, experienceCumulative: 1 },
    { key: '09:00', label: '09', count: 1, secondaryCount: 1, experienceCount: 0, cumulative: 3, secondaryCumulative: 2, experienceCumulative: 1 }
  ]);
});

test('buildSummary returns totals and latest timestamp for dashboard cards', () => {
  const summary = buildSummary(normalizeRows(rows));

  assert.equal(summary.totalRows, 6);
  assert.equal(summary.uniqueUsers, 3);
  assert.equal(summary.latestDateKey, '2026-05-31');
  assert.equal(summary.days, 3);
});
