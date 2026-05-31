# Line Login Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages dashboard backed by a token-protected Google Apps Script proxy for private Sheet login statistics.

**Architecture:** The front end is plain HTML, CSS, and ES modules. Apps Script reads the private Sheet and returns minimal JSON. Shared aggregation logic is isolated in `assets/js/core.mjs` and covered by Node tests.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node's built-in test runner, Google Apps Script.

---

### Task 1: Data Aggregation Core

**Files:**
- Create: `assets/js/core.js`
- Test: `tests/core.test.mjs`

- [x] **Step 1: Write failing tests**

Tests cover date grouping, distinct `lineUserId` counting, cumulative totals, and hourly drilldown.

- [x] **Step 2: Run tests and verify failure**

Run: `node --test tests/core.test.mjs`
Expected: fail because `assets/js/core.mjs` does not exist.

- [ ] **Step 3: Implement aggregation functions**

Export `normalizeRows`, `groupDaily`, `groupHourlyForDate`, and `buildSummary`.

- [ ] **Step 4: Run tests and verify pass**

Run: `node --test tests/core.test.mjs`
Expected: all tests pass.

### Task 2: Static Dashboard UI

**Files:**
- Create: `index.html`
- Create: `assets/css/styles.css`
- Create: `assets/js/app.js`
- Create: `assets/js/config.js`

- [ ] Build dashboard layout with summary cards, daily chart, hourly chart, loading state, and error state.
- [ ] Render combo charts as inline SVG with bars and cumulative trend line.
- [ ] Wire daily bar clicks to hourly drilldown.

### Task 3: Apps Script Proxy

**Files:**
- Create: `apps-script/Code.gs`

- [ ] Validate `token` against Script Properties.
- [ ] Read configured Sheet.
- [ ] Return only `timestamp` and `lineUserId` rows.
- [ ] Return JSON errors without exposing Sheet contents.

### Task 4: Deployment Docs

**Files:**
- Create: `README.md`

- [ ] Document Apps Script setup, Script Properties, Sheet sharing, config changes, GitHub Pages deployment, and local testing.

### Task 5: Verification

- [ ] Run `node --test tests/core.test.mjs`.
- [ ] Run a local static server and inspect the dashboard.
- [ ] Confirm responsive layout at desktop and mobile widths.
