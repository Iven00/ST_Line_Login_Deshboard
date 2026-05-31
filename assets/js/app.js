import {
  buildSummary,
  filterRowsByExcludedDisplayNames,
  getDisplayNameOptions,
  groupDaily,
  groupHourlyForDate,
  normalizeDisplayNameList,
  normalizeRows
} from './core.js?v=9';

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

const state = {
  allRows: [],
  rows: [],
  daily: [],
  selectedDate: '',
  excludedDisplayNames: new Set()
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
  clearFilters: document.querySelector('[data-clear-filters]')
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
  const maxValue = Math.max(1, ...data.map((item) => Math.max(item.count, item.cumulative)));
  const barSlot = chart.width / data.length;
  const barWidth = Math.min(42, barSlot * 0.46);
  const trendPoints = data
    .map((item, index) => pointFor(index, item.cumulative, data.length, maxValue, chart).join(','))
    .join(' ');

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
      const x = chart.left + barSlot * index + barSlot / 2 - barWidth / 2;
      const barHeight = (item.count / maxValue) * chart.height;
      const y = chart.top + chart.height - barHeight;
      const isSelected = item.key === options.selectedKey;
      const labelY = barHeight < 20 ? y - 7 : y + Math.max(14, barHeight / 2 + 4);
      const labelClass = barHeight < 20 ? 'bar-value is-outside' : 'bar-value';
      const valueLabel = item.count > 0
        ? `<text x="${x + barWidth / 2}" y="${labelY}" class="${labelClass}">${item.count}</text>`
        : '';

      return `
        <g class="bar-group ${isSelected ? 'is-selected' : ''}" data-key="${item.key}" tabindex="0" role="button" aria-label="${item.label} ${item.count}">
          <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(3, barHeight)}" rx="8" />
          ${valueLabel}
          <text x="${x + barWidth / 2}" y="${chart.top + chart.height + 28}" class="axis-label">${item.label}</text>
          <title>${item.label}: ${item.count} / 累計 ${item.cumulative}</title>
        </g>
      `;
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
      return `
        <g class="trend-point">
          <text x="${labelX}" y="${labelY}" class="trend-value" text-anchor="${labelAnchor}">${item.cumulative}</text>
          <circle cx="${x}" cy="${y}" r="5" class="trend-dot"><title>累計 ${item.cumulative}</title></circle>
        </g>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg class="combo-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.title}">
      <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg" />
      ${axisLabels}
      <line x1="${chart.left}" y1="${chart.top + chart.height}" x2="${chart.left + chart.width}" y2="${chart.top + chart.height}" class="axis-line" />
      ${bars}
      <polyline points="${trendPoints}" class="trend-line" />
      ${points}
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

function renderCharts() {
  const hourly = groupHourlyForDate(state.rows, state.selectedDate);
  elements.selectedDate.textContent = state.selectedDate || '-';

  renderComboChart(elements.dailyChart, state.daily, {
    title: '每日登入數與累計趨勢',
    selectedKey: state.selectedDate,
    onSelect: (dateKey) => {
      state.selectedDate = dateKey;
      renderCharts();
    }
  });

  renderComboChart(elements.hourlyChart, hourly, {
    title: `${state.selectedDate} 每小時登入數與累計趨勢`
  });
}

function applyFiltersAndRender() {
  state.rows = filterRowsByExcludedDisplayNames(state.allRows, state.excludedDisplayNames);
  state.daily = groupDaily(state.rows);

  if (!state.daily.some((item) => item.key === state.selectedDate)) {
    state.selectedDate = state.daily.at(-1)?.key ?? '';
  }

  renderSummary(buildSummary(state.rows));
  renderFilters();
  renderCharts();
}

function renderDashboard(rows, excludedDisplayNames = []) {
  state.allRows = normalizeRows(rows);
  state.excludedDisplayNames = new Set(normalizeDisplayNameList(excludedDisplayNames));
  state.selectedDate = '';
  applyFiltersAndRender();
}

async function init() {
  try {
    const data = await loadDashboardData();
    renderDashboard(data.rows, data.excludedDisplayNames);
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

setupFilterResize();
init();

const refreshMinutes = Number(window.DASHBOARD_CONFIG?.refreshMinutes ?? 0);
if (refreshMinutes > 0) {
  setInterval(init, refreshMinutes * 60 * 1000);
}
