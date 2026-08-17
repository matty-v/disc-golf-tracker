# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests
npm test
# or directly:
node tests/run-tests.js

# Local dev server
python -m http.server 8080

# Deploy (automatic on merge to main via GitHub Actions → Firebase Hosting,
# gated on tests passing)
# Manual: firebase deploy
```

## Architecture

Zero-dependency vanilla JavaScript PWA with no build step. All source is plain ES6+ loaded directly by the browser.

### Module Layout (`js/`)

- **app.js** — Main controller: screen management, event delegation, round lifecycle. This is the largest file and orchestrates everything.
- **config.js** — Centralized constants: API endpoints, validation rules, storage keys. Deep-frozen (top level and everything nested) to prevent accidental mutation.
- **storage.js** — Data persistence layer using IndexedDB (courses, holes, rounds, scores) and localStorage (settings, current round, offline sync queue).
- **sheets-api.js** — Google Sheets API client via a Cloud Function backend (`sheetsApi` on GCP project `kinetic-object-322814`). Handles CRUD for all sheet tabs and sync operations.
- **statistics.js** — Calculates hole-specific and course-aggregate stats (averages, best/worst rounds), plus `isHoleCounted(score)` — the commit predicate (`approaches + putts === throws - 1`) that `app.js` uses to decide whether a hole counts toward the live round-score bar. This predicate never reaches a round's saved total: `calculateRunningTotal()` stays unfiltered, and `finishRound()`/`renderSummary()` call it with every hole that has throws, regardless of commit state.
- **utils.js** — UUID generation, date formatting, score calculations, DOM helpers, toast notifications, input validation.

### Data Flow

The app is offline-first: a round is durable in local storage the moment it's finished, before it's ever synced. Data writes go to local storage immediately, then sync to Google Sheets via the Cloud Function backend. A pending sync queue (in localStorage) tracks unsynced operations and is retried on app init, on the browser's `online` event, and after an explicit settings save — there is no periodic polling timer.

### Google Sheets Schema

Four tabs: **Courses** (course_id, course_name, hole_count, created_date, last_played), **Holes** (hole_id, course_id, hole_number, par, distance), **Rounds** (round_id, course_id, round_date, completed, total_score, total_par), **Scores** (score_id, round_id, hole_id, hole_number, throws, approaches, putts, created_at).

### Testing

Custom Node.js VM-based test runner that mocks browser APIs (localStorage, document, navigator). Test files are in `tests/` with `.test.js` suffix. Tests run in CI on PRs.

## Deployment

- **Hosting**: Firebase Hosting → `disc-golf-voget.web.app`
- **GCP Project**: `kinetic-object-322814`
- **CI/CD**: GitHub Actions — tests run on PRs and gate the deploy job on merge to main (`.github/workflows/deploy.yml`), preview channels for PRs (7-day expiry)

## UI

Dark theme (Catppuccin Mocha), mobile-first responsive design, single-page app with screen-based navigation managed in `app.js`. Service worker (`sw.js`) provides offline caching with cache-first for static assets and network-first for API calls.
