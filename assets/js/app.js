import {
  buildSummary,
  groupDaily,
  groupHourlyForDate,
  normalizeRows
} from './core.mjs';

const sampleRows = [
  { timestamp: '2026-05-27T07:40:00+08:00', lineUserId: 'U001' },
  { timestamp: '2026-05-27T08:12:00+08:00', lineUserId: 'U002' },
  { timestamp: '2026-05-28T09:10:00+08:00', lineUserId: 'U002' },
  { timestamp: '2026-05-28T09:20:00+08:00', lineUserId: 'U003' },
  { timestamp: '2026-05-29T13:10:00+08:00', lineUserId: 'U004' },
  { timestamp: '2026-05-30T08:20:00+08:00', lineUserId: 'U005' },
  { timestamp: '2026-05-30T08:40:00+08:00', lineUserId: 'U006' },
  { timestamp: '2026-05-30T10:00:00+08:00', lineUserId: 'U005' },
  { timestamp: '2026-05-31T15:18:00+08:00', lineUserId: 'U007' }
];

const state = {
  rows: [],
  daily: [],
  selectedDate: ''
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
  latestDate: document.querySelector('[data-latest-date]')
};

function setStatus(message, tone = 'neutral') {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function numberText(value) {
  return new Intl.NumberFormat('zh-Hant-TW').format(value);
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

async function loadRows() {
  const apiUrl = buildApiUrl();

  if (!apiUrl) {
    setStatus('目前使用展示資料。請在 assets/js/config.js 設定 Apps Script URL 與 token。');
    return sampleRows;
  }

  setStatus('正在讀取 Google Sheet 統計資料...');
  const response = await fetch(apiUrl, { cache: 'no-store' });
  const payload = await response.json();

  if (!response.ok || payload.status !== 'ok') {
    throw new Error(payload.message || '資料讀取失敗');
  }

  return payload.rows ?? [];
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
  const chart = { left: 58, top: 28, width: 800, height: 230 };
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

      return `
        <g class="bar-group ${isSelected ? 'is-selected' : ''}" data-key="${item.key}" tabindex="0" role="button" aria-label="${item.label} ${item.count}">
          <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(3, barHeight)}" rx="8" />
          <text x="${x + barWidth / 2}" y="${chart.top + chart.height + 28}" class="axis-label">${item.label}</text>
          <title>${item.label}: ${item.count} / 累計 ${item.cumulative}</title>
        </g>
      `;
    })
    .join('');

  const points = data
    .map((item, index) => {
      const [x, y] = pointFor(index, item.cumulative, data.length, maxValue, chart);
      return `<circle cx="${x}" cy="${y}" r="5" class="trend-dot"><title>累計 ${item.cumulative}</title></circle>`;
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

function renderDashboard(rows) {
  state.rows = normalizeRows(rows);
  state.daily = groupDaily(state.rows);
  state.selectedDate = state.daily.at(-1)?.key ?? '';

  renderSummary(buildSummary(state.rows));
  renderComboChart(elements.dailyChart, state.daily, {
    title: '每日登入數與累計趨勢',
    selectedKey: state.selectedDate,
    onSelect: (dateKey) => {
      state.selectedDate = dateKey;
      renderCharts();
    }
  });
  renderCharts();
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

async function init() {
  try {
    const rows = await loadRows();
    renderDashboard(rows);
    setStatus('資料已更新', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
    renderDashboard([]);
  }
}

init();

const refreshMinutes = Number(window.DASHBOARD_CONFIG?.refreshMinutes ?? 0);
if (refreshMinutes > 0) {
  setInterval(init, refreshMinutes * 60 * 1000);
}
