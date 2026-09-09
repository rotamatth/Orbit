# Regression checks

Requires Node 22 or newer. The application still has no runtime dependencies or build step.

```sh
npm ci --ignore-scripts
npm test
```

- `logic.test.mjs`: cycle detection, forecasts, date classification, sharing and encryption.
- `reliability.test.mjs`: failed saves, previous-copy recovery, undo, invalid imports, explicit cycle starts, disturbed BBT, irregular intervals, exact shared dates, dose timestamps and historical backtesting.
- `dom.test.mjs`: imports the actual `main-v5.js` entry point and every active screen extension; covers routes, logging, partner privacy, pill mode, dose refresh, focus, validation and reminders.
- `offline.test.mjs`: checks that every shell file exists, incomplete installs fail, unrelated caches survive and missing scripts are not replaced with HTML.
- `sync.test.mjs`: executes the supplied SQL in a local PostgreSQL-compatible PGlite instance and verifies anonymous table access is denied, room reads are scoped, and another writer cannot replace a record.

The fixtures are synthetic. Passing checks does not establish clinical accuracy. Real-device Safari installation, storage pressure, offline upgrades, accessibility and notification behavior still need device testing.
