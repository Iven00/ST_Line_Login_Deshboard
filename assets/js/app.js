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
} from './core.js?v=20';

const FILTER_STORAGE_KEY = 'stLineLoginDashboard.excludedDisplayNames.v1';
const FILTER_HEIGHT_STORAGE_KEY = 'stLineLoginDashboard.filterListHeight.v1';
let saveFiltersTimer = null;

const sampleRows = [
  { timestamp: '2026-05-27T07:40:00+08:00', lineUserId: 'U001', displayName: '測試帳號 A' },
  { timestamp: '2026-05-27T08:12:00+08:00', lineUserId: 'U002', displayName: '測試帳號 B' },
  { timestamp: '2026-05-28T09:10:00+08:00', lineUserId: 'U002', displayName: '測試帳號 B' },
  { timestamp: '2026-05-28T09:20:00+08:00', lineUserId: 'U003', displayName: '測試帳號 C' },
  { timestamp: '2026-05-29T13:10:00+08:00', lineUserId: 'U004', displayName: '測試帳號 D' },
  { timestamp: '2026-05-30T08:20:00+08:00', lineUserId: 'U005', displayName: '測試帳號 E' },
  { timestamp: '2026-05-30T08:40:00+08:00', lineUserId: 'U006', displayName: '測試帳號 F' },
  { timestamp: '2026-05-30T10:00:00+08:00', lineUserId: 'U005', displayName: '測試帳號 E' },
  { timestamp: '2026-05-31T15:18:00+08:00', lineUserId: 'U007', displayName: '' }
];
const sampleChildRows = [
  { timestamp: '2026-05-28T10:20:00+08:00', childId: 'A123' },
  { timestamp: '2026-05-29T11:05:00+08:00', childId: 'B456' },
  { timestamp: '2026-05-30T12:25:00+08:00', childId: 'C789' },
  { timestamp: '2026-05-30T13:25:00+08:00', childId: 'D012' },
  { timestamp: '2026-05-31T16:25:00+08:00', childId: 'E345' }
];
const sampleExperienceRows = [
  { timestamp: '2026-05-28T10:40:00+08:00', participantName: '體驗 A' },
  { timestamp: '2026-05-30T11:15:00+08:00', participantName: '體驗 B' },
  { timestamp: '2026-05-30T17:20:00+08:00', participantName: '體驗 C' },
  { timestamp: '2026-05-31T14:05:00+08:00', participantName: '體驗 D' }
];

const state = {
  allRows: [],
  childRows: [],
  experienceRows: [],
  rows: [],
  daily: [],
  selectedDate: '',
  excludedDisplayNames: new Set(),
  hideExperienceSeries: false,
  hideSecondarySeries: false
};

const elements = {
  status: document.querySelector('[data-status]'),
  dailyChart: document.querySelector('[data-daily-chart]'),
  hourlyChart: document.querySelector('[data-hourly-chart]'),
  selectedDate: document.querySelector('[data-selected-date]'),
  updatedAt: document.querySelector('[data-updated-at]'),
  totalRows: document.querySelector('[data-total-rows]'),
  uniqueUsers: document.querySelector('[data-unique-users]'),
  activeDays: document.querySelector('[data-active-days]'),
  latestDate: document.querySelector('[data-latest-date]'),
  filterList: document.querySelector('[data-filter-list]'),
  filterResizeHandle: document.querySelector('[data-filter-resize-handle]'),
  filterSummary: document.querySelector('[data-filter-summary]'),
  selectAllFilters: document.querySelector('[data-select-all-filters]'),
  clearFilters: document.querySelector('[data-clear-filters]'),
  hideExperienceSeries: document.querySelector('[data-hide-experience-series]'),
  hideSecondarySeries: document.querySelector('[data-hide-secondary-series]'),
  experienceLegends: document.querySelectorAll('[data-experience-legend]'),
  secondaryLegends: document.querySelectorAll('[data-secondary-legend]')
};

function setStatus(message, tone = 'neutral') {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function numberText(value) {
  return new Intl.NumberFormat('zh-Hant-TW').format(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadFallbackFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '[]');
    return new Set(normalizeDisplayNameList(saved));
  } catch {
    return new Set();
  }
}

function persistFilters() {
  const excludedDisplayNames = normalizeDisplayNameList([...state.excludedDisplayNames]);
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(excludedDisplayNames));

  const apiUrl = buildApiUrl();
  if (!apiUrl) {
    return;
  }

  clearTimeout(saveFiltersTimer);
  saveFiltersTimer = setTimeout(async () => {
    try {
      const saveUrl = new URL(apiUrl);
      saveUrl.searchParams.set('action', 'saveFilters');
      saveUrl.searchParams.set('excludedDisplayNames', JSON.stringify(excludedDisplayNames));
      const response = await fetch(saveUrl.toString(), { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || payload.status !== 'ok') {
        throw new Error(payload.message || '濾除設定儲存失敗');
      }

      setStatus('資料已更新，濾除設定已同步', 'ok');
    } catch (error) {
      setStatus(`資料已更新，但濾除設定未同步：${error.message}`, 'error');
    }
  }, 350);
}

function buildApiUrl() {
  const config = window.DASHBOARD_CONFIG ?? {};

  if (!config.apiUrl || config.apiUrl.includes('PASTE_YOUR')) {
    return null;
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set('token', config.token ?? '');
  return url.toString();
}

async function loadDashboardData() {
  const apiUrl = buildApiUrl();

  if (!apiUrl) {
    setStatus('目前使用展示資料。請在 assets/js/config.js 設定 Apps Script URL 與 token。');
    return {
      rows: sampleRows,
      childRows: sampleChildRows,
      experienceRows: sampleExperienceRows,
      excludedDisplayNames: [...loadFallbackFilters()]
    };
  }

  setStatus('正在讀取 Google Sheet 統計資料...');
  const response = await fetch(apiUrl, { cache: 'no-store' });
  const payload = await response.json();

  if (!response.ok || payload.status !== 'ok') {
    throw new Error(payload.message || '資料讀取失敗');
  }

  return {
    rows: payload.rows ?? [],
    childRows: payload.childRows ?? [],
    experienceRows: payload.experienceRows ?? [],
    excludedDisplayNames: normalizeDisplayNameList(payload.settings?.excludedDisplayNames ?? [])
  };
}

function renderSummary(summary) {
  elements.totalRows.textContent = numberText(summary.totalRows);
  elements.uniqueUsers.textContent = numberText(summary.uniqueUsers);
  elements.activeDays.textContent = numberText(summary.days);
  elements.latestDate.textContent = summary.latestDateKey || '-';
  elements.updatedAt.textContent = new Intl.DateTimeFormat('zh-Hant-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei'
  }).format(new Date());
}

function renderFilters() {
  const options = getDisplayNameOptions(state.allRows);

  if (!options.length) {
    elements.filterList.innerHTML = '<div class="empty-filter">沒有可過濾的帳號</div>';
    elements.filterSummary.textContent = '未套用濾除';
    return;
  }

  const validNames = new Set(options.map((option) => option.name));
  state.excludedDisplayNames = new Set([...state.excludedDisplayNames].filter((name) => validNames.has(name)));
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...state.excludedDisplayNames]));

  elements.filterSummary.textContent = state.excludedDisplayNames.size
    ? `已濾除 ${state.excludedDisplayNames.size} 個帳號`
    : '未套用濾除';

  elements.filterList.innerHTML = options
    .map((option) => {
      const checked = state.excludedDisplayNames.has(option.name) ? 'checked' : '';
      const selectedClass = checked ? ' is-selected' : '';
      return `
        <label class="filter-chip${selectedClass}">
          <input type="checkbox" value="${escapeHtml(option.name)}" ${checked}>
          <span>${escapeHtml(option.name)}</span>
          <small>${option.count}</small>
        </label>
      `;
    })
    .join('');

  elements.filterList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.excludedDisplayNames.add(checkbox.value);
      } else {
        state.excludedDisplayNames.delete(checkbox.value);
      }

      persistFilters();
      applyFiltersAndRender();
    });
  });
}

function setupFilterResize() {
  let startY = 0;
  let startHeight = 0;

  const stopResize = () => {
    document.removeEventListener('pointermove', resize);
    document.removeEventListener('pointerup', stopResize);
    document.body.classList.remove('is-resizing-filter');
  };

  const resize = (event) => {
    const nextHeight = Math.min(420, Math.max(96, startHeight + event.clientY - startY));
    elements.filterList.style.maxHeight = `${nextHeight}px`;
    localStorage.setItem(FILTER_HEIGHT_STORAGE_KEY, String(nextHeight));
  };

  const savedHeight = Number(localStorage.getItem(FILTER_HEIGHT_STORAGE_KEY));
  if (Number.isFinite(savedHeight) && savedHeight >= 96) {
    elements.filterList.style.maxHeight = `${Math.min(420, savedHeight)}px`;
  }

  elements.filterResizeHandle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startY = event.clientY;
    startHeight = elements.filterList.getBoundingClientRect().height;
    document.body.classList.add('is-resizing-filter');
    document.addEventListener('pointermove', resize);
    document.addEventListener('pointerup', stopResize);
  });
}

function pointFor(index, value, length, maxValue, chart) {
  const x = chart.left + (length <= 1 ? chart.width / 2 : (chart.width * index) / (length - 1));
  const y = chart.top + chart.height - (value / maxValue) * chart.height;
  return [x, y];
}

function renderComboChart(container, data, options = {}) {
  container.innerHTML = '';

  if (!data.length) {
    container.innerHTML = '<div class="empty-state">沒有可顯示的資料</div>';
    return;
  }

  const width = 920;
  const height = 330;
  const chart = { left: 58, top: 48, width: 800, height: 210 };
  const showExperience = options.showExperience !== false;
  const showSecondary = options.showSecondary !== false;
  const maxValue = Math.max(1, ...data.map((item) => Math.max(
    item.count,
    showExperience ? item.experienceCount ?? 0 : 0,
    showSecondary ? item.secondaryCount ?? 0 : 0,
    item.cumulative,
    showExperience ? item.experienceCumulative ?? 0 : 0,
    showSecondary ? item.secondaryCumulative ?? 0 : 0
  )));
  const barSlot = chart.width / data.length;
  const hasSecondary = showSecondary && data.some((item) => Number(item.secondaryCount ?? 0) > 0);
  const hasExperience = showExperience && data.some((item) => Number(item.experienceCount ?? 0) > 0);
  const barCount = 1 + Number(hasExperience) + Number(hasSecondary);
  const barWidth = barCount > 1 ? Math.min(20, barSlot * 0.2) : Math.min(42, barSlot * 0.46);
  const barGap = barCount > 1 ? Math.min(7, barSlot * 0.06) : 0;
  const barOffset = barWidth + barGap;
  const trendPoints = data
    .map((item, index) => pointFor(index, item.cumulative, data.length, maxValue, chart).join(','))
    .join(' ');
  const experienceTrendPoints = hasExperience ? data
    .map((item, index) => pointFor(index, item.experienceCumulative ?? 0, data.length, maxValue, chart).join(','))
    .join(' ') : '';
  const secondaryTrendPoints = hasSecondary ? data
    .map((item, index) => pointFor(index, item.secondaryCumulative ?? 0, data.length, maxValue, chart).join(','))
    .join(' ') : '';

  const axisLabels = [0, Math.ceil(maxValue / 2), maxValue]
    .map((value) => {
      const y = chart.top + chart.height - (value / maxValue) * chart.height;
      return `
        <line x1="${chart.left}" y1="${y}" x2="${chart.left + chart.width}" y2="${y}" class="grid-line" />
        <text x="${chart.left - 14}" y="${y + 4}" class="axis-value">${value}</text>
      `;
    })
    .join('');

  const bars = data
    .map((item, index) => {
      const centerX = chart.left + barSlot * index + barSlot / 2;
      const isSelected = item.key === options.selectedKey;
      const primaryX = barCount === 1 ? centerX - barWidth / 2 : centerX - (barOffset * (barCount - 1)) / 2 - barWidth / 2;
      const experienceX = hasExperience ? primaryX + barOffset : centerX - barWidth / 2;
      const secondaryX = hasSecondary ? primaryX + barOffset * (barCount - 1) : centerX - barWidth / 2;
      const primaryBar = renderBar({
        x: primaryX,
        width: barWidth,
        count: item.count,
        maxValue,
        chart
      });
      const experienceBar = hasExperience ? renderBar({
        x: experienceX,
        width: barWidth,
        count: item.experienceCount ?? 0,
        maxValue,
        chart,
        rectClass: 'experience-bar'
      }) : '';
      const secondaryBar = hasSecondary ? renderBar({
        x: secondaryX,
        width: barWidth,
        count: item.secondaryCount ?? 0,
        maxValue,
        chart,
        rectClass: 'secondary-bar'
      }) : '';

      return `
        <g class="bar-group ${isSelected ? 'is-selected' : ''}" data-key="${item.key}" tabindex="0" role="button" aria-label="${item.label} ${item.count}">
          ${primaryBar}
          ${experienceBar}
          ${secondaryBar}
          <text x="${centerX}" y="${chart.top + chart.height + 28}" class="axis-label">${item.label}</text>
          <title>${item.label}: LINE ${item.count} / 體驗 ${item.experienceCount ?? 0} / 招生 ${item.secondaryCount ?? 0} / 累計 ${item.cumulative}</title>
        </g>
      `;
    })
    .join('');

  const barLabels = data
    .map((item, index) => {
      const centerX = chart.left + barSlot * index + barSlot / 2;
      const primaryX = barCount === 1 ? centerX - barWidth / 2 : centerX - (barOffset * (barCount - 1)) / 2 - barWidth / 2;
      const experienceX = hasExperience ? primaryX + barOffset : centerX - barWidth / 2;
      const secondaryX = hasSecondary ? primaryX + barOffset * (barCount - 1) : centerX - barWidth / 2;
      const primaryLabel = renderBarLabel({
        x: primaryX,
        width: barWidth,
        count: item.count,
        maxValue,
        chart,
        valueClass: 'bar-value primary'
      });
      const experienceLabel = hasExperience ? renderBarLabel({
        x: experienceX,
        width: barWidth,
        count: item.experienceCount ?? 0,
        maxValue,
        chart,
        valueClass: 'bar-value experience'
      }) : '';
      const secondaryLabel = hasSecondary ? renderBarLabel({
        x: secondaryX,
        width: barWidth,
        count: item.secondaryCount ?? 0,
        maxValue,
        chart,
        valueClass: 'bar-value secondary'
      }) : '';

      return `${primaryLabel}${experienceLabel}${secondaryLabel}`;
    })
    .join('');

  const points = data
    .map((item, index) => {
      const [x, y] = pointFor(index, item.cumulative, data.length, maxValue, chart);
      const isLast = index === data.length - 1;
      const isFirst = index === 0;
      const labelX = isLast ? x - 10 : isFirst ? x + 10 : x;
      const labelAnchor = isLast ? 'end' : isFirst ? 'start' : 'middle';
      const labelY = Math.max(16, y - 18);
      const valueLabel = item.cumulative > 0
        ? `<text x="${labelX}" y="${labelY}" class="trend-value" text-anchor="${labelAnchor}">${item.cumulative}</text>`
        : '';
      return `
        <g class="trend-point">
          ${valueLabel}
          <circle cx="${x}" cy="${y}" r="5" class="trend-dot"><title>累計 ${item.cumulative}</title></circle>
        </g>
      `;
    })
    .join('');
  const experiencePoints = hasExperience ? data
    .map((item, index) => {
      const [x, y] = pointFor(index, item.experienceCumulative ?? 0, data.length, maxValue, chart);
      const isLast = index === data.length - 1;
      const isFirst = index === 0;
      const labelX = isLast ? x - 10 : isFirst ? x + 10 : x;
      const labelAnchor = isLast ? 'end' : isFirst ? 'start' : 'middle';
      const labelY = Math.max(24, y - 14);
      const cumulative = item.experienceCumulative ?? 0;
      const valueLabel = cumulative > 0
        ? `<text x="${labelX}" y="${labelY}" class="experience-trend-value" text-anchor="${labelAnchor}">${cumulative}</text>`
        : '';
      return `
        <g class="experience-trend-point">
          ${valueLabel}
          <circle cx="${x}" cy="${y}" r="4" class="experience-trend-dot"><title>體驗累計 ${cumulative}</title></circle>
        </g>
      `;
    })
    .join('') : '';
  const secondaryPoints = hasSecondary ? data
    .map((item, index) => {
      const [x, y] = pointFor(index, item.secondaryCumulative ?? 0, data.length, maxValue, chart);
      const isLast = index === data.length - 1;
      const isFirst = index === 0;
      const labelX = isLast ? x - 10 : isFirst ? x + 10 : x;
      const labelAnchor = isLast ? 'end' : isFirst ? 'start' : 'middle';
      const labelY = Math.max(30, y - 10);
      const cumulative = item.secondaryCumulative ?? 0;
      const valueLabel = cumulative > 0
        ? `<text x="${labelX}" y="${labelY}" class="secondary-trend-value" text-anchor="${labelAnchor}">${cumulative}</text>`
        : '';
      return `
        <g class="secondary-trend-point">
          ${valueLabel}
          <circle cx="${x}" cy="${y}" r="4" class="secondary-trend-dot"><title>招生累計 ${cumulative}</title></circle>
        </g>
      `;
    })
    .join('') : '';

  container.innerHTML = `
    <svg class="combo-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.title}">
      <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg" />
      ${axisLabels}
      <line x1="${chart.left}" y1="${chart.top + chart.height}" x2="${chart.left + chart.width}" y2="${chart.top + chart.height}" class="axis-line" />
      ${hasSecondary ? `<polyline points="${secondaryTrendPoints}" class="secondary-trend-line" />` : ''}
      ${hasExperience ? `<polyline points="${experienceTrendPoints}" class="experience-trend-line" />` : ''}
      <polyline points="${trendPoints}" class="trend-line" />
      ${secondaryPoints}
      ${experiencePoints}
      ${points}
      ${bars}
      ${barLabels}
    </svg>
  `;

  if (options.onSelect) {
    container.querySelectorAll('.bar-group').forEach((bar) => {
      const select = () => options.onSelect(bar.dataset.key);
      bar.addEventListener('click', select);
      bar.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });
  }
}

function renderBar({ x, width, count, maxValue, chart, rectClass = '' }) {
  const barHeight = (count / maxValue) * chart.height;
  const y = chart.top + chart.height - barHeight;

  return `<rect class="${rectClass}" x="${x}" y="${y}" width="${width}" height="${Math.max(3, barHeight)}" rx="8" />`;
}

function renderBarLabel({ x, width, count, maxValue, chart, valueClass }) {
  if (count <= 0) {
    return '';
  }

  const barHeight = (count / maxValue) * chart.height;
  const y = chart.top + chart.height - barHeight;
  const labelY = barHeight < 20 ? y - 7 : y + Math.max(14, barHeight / 2 + 4);
  const labelClass = barHeight < 20 ? `${valueClass} is-outside` : valueClass;

  return `<text x="${x + width / 2}" y="${labelY}" class="${labelClass}">${count}</text>`;
}

function renderCharts() {
  const lineHourly = groupHourlyForDate(state.rows, state.selectedDate, { shortHourLabel: true });
  const childHourly = groupHourlyForDate(state.childRows, state.selectedDate, { shortHourLabel: true });
  const experienceHourly = groupHourlyForDate(state.experienceRows, state.selectedDate, { shortHourLabel: true });
  const hourly = combineSeries(lineHourly, childHourly, experienceHourly);
  elements.selectedDate.textContent = state.selectedDate || '-';
  updateSeriesFilterUi();

  renderComboChart(elements.dailyChart, state.daily, {
    title: '每日登入數與累計趨勢',
    selectedKey: state.selectedDate,
    showExperience: !state.hideExperienceSeries,
    showSecondary: !state.hideSecondarySeries,
    onSelect: (dateKey) => {
      state.selectedDate = dateKey;
      renderCharts();
    }
  });

  renderComboChart(elements.hourlyChart, hourly, {
    title: `${state.selectedDate} 每小時登入數與累計趨勢`,
    showExperience: !state.hideExperienceSeries,
    showSecondary: !state.hideSecondarySeries
  });
}

function updateSeriesFilterUi() {
  if (elements.hideExperienceSeries) {
    elements.hideExperienceSeries.checked = state.hideExperienceSeries;
  }

  if (elements.hideSecondarySeries) {
    elements.hideSecondarySeries.checked = state.hideSecondarySeries;
  }

  elements.experienceLegends.forEach((legend) => {
    legend.classList.toggle('is-hidden', state.hideExperienceSeries);
  });
  elements.secondaryLegends.forEach((legend) => {
    legend.classList.toggle('is-hidden', state.hideSecondarySeries);
  });
}

function applyFiltersAndRender() {
  state.rows = filterRowsByExcludedDisplayNames(state.allRows, state.excludedDisplayNames);
  state.daily = combineSeries(groupDaily(state.rows), groupDaily(state.childRows), groupDaily(state.experienceRows));

  if (!state.daily.some((item) => item.key === state.selectedDate)) {
    state.selectedDate = state.daily.at(-1)?.key ?? '';
  }

  renderSummary(buildSummary(state.rows));
  renderFilters();
  renderCharts();
}

function renderDashboard(rows, childRows = [], experienceRows = [], excludedDisplayNames = []) {
  state.allRows = normalizeRows(rows);
  state.childRows = normalizeChildRows(childRows);
  state.experienceRows = normalizeExperienceRows(experienceRows);
  state.excludedDisplayNames = new Set(normalizeDisplayNameList(excludedDisplayNames));
  state.selectedDate = '';
  applyFiltersAndRender();
}

async function init() {
  try {
    const data = await loadDashboardData();
    renderDashboard(data.rows, data.childRows, data.experienceRows, data.excludedDisplayNames);
    setStatus('資料已更新', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
    renderDashboard([]);
  }
}

elements.selectAllFilters.addEventListener('click', () => {
  state.excludedDisplayNames = new Set(getDisplayNameOptions(state.allRows).map((option) => option.name));
  persistFilters();
  applyFiltersAndRender();
});

elements.clearFilters.addEventListener('click', () => {
  state.excludedDisplayNames = new Set();
  persistFilters();
  applyFiltersAndRender();
});

elements.hideExperienceSeries?.addEventListener('change', () => {
  state.hideExperienceSeries = elements.hideExperienceSeries.checked;
  renderCharts();
});

elements.hideSecondarySeries?.addEventListener('change', () => {
  state.hideSecondarySeries = elements.hideSecondarySeries.checked;
  renderCharts();
});

setupFilterResize();
init();

const refreshMinutes = Number(window.DASHBOARD_CONFIG?.refreshMinutes ?? 0);
if (refreshMinutes > 0) {
  setInterval(init, refreshMinutes * 60 * 1000);
}
