# Orbit v12 upgrade

## Before updating

Download a JSON backup on the tracker phone. Keep the existing site origin and path so browser storage remains available. Health history stays under `orbit.v1`; a previous valid snapshot is retained under `orbit.v1.previous`. No existing dates are rewritten by this release.

The new backup exporter intentionally omits the PIN hash, sync passphrase and API key. Restoring a backup restores logs/settings but requires reconnecting live sync and setting a new PIN. Exported JSON is otherwise plaintext health data.

## Optional live sync: SQL update required

Existing live-sync installations must run the complete SQL displayed in **More → Share with a partner → database setup** in their own Supabase SQL Editor. The SQL is exported as `SUPABASE_SQL` in `app/connect.js`.

The migration creates `orbit_sync_v2` and two restricted RPC functions. Direct anonymous/authenticated table access is revoked, including access to the old `orbit_sync` table when present. Old encrypted rows are retained. Update both devices, run the SQL once, then sync from the tracker before pulling on the partner. Existing project URL, anon key, room and passphrase can be reused.

The room token is a read capability derived from the shared room and passphrase. A separate random device writer secret protects updates to that device's row. Use a long unique passphrase; possession of the room token permits reading its encrypted payloads. This is not account-based access control, revocation or abuse-rate limiting. The server still receives timing metadata. The writer secret is local and is not included in backup exports; a fresh device ID is created with a missing writer secret.

Without this SQL migration, upgraded live sync reports an error. Share links and local tracking remain available. No database migration is executed automatically by the app.

## Changes users will see

- A cycle's current day stays anchored to a recorded start even after the estimate passes.
- Explicit cycle-start entries affect cycle boundaries. Long intervals remain recorded and make the estimate uncertain; the app does not divide them into presumed missing periods.
- BBT evidence uses the same disturbance and continuity checks everywhere. At least three supported cycles are required to replace a configured luteal estimate.
- Pill mode pauses calendar forecasts. Dose status, full timestamps and schedules are shared across cards, statistics and reminders. Older clock-only entries remain marked as date-unknown.
- Sharing v2 preserves exact recorded bleeding dates without sharing intensity, symptoms, temperatures, notes or pill formulation. It includes whether forecasts are available. Old share links retain starts and request a refreshed link rather than inventing intervening bleeding days.
- Save errors are visible; unreadable data is not overwritten. Recovery and undo are available. “No bleeding” is distinct from no entry.
- Daily logging is higher on the home screen; additional categories are expandable. Zoom, keyboard focus and larger pill labels are supported.
- Updates require a complete cached shell. An update button reloads into the new version; the first transition from the old service worker may still follow the old worker's activation rules.

## Limits and follow-up work

Run `npm ci --ignore-scripts && npm test` before release. Test the new release on iPhone Safari/PWA before relying on it daily. The development environment's remote browser could not open the local preview; DOM behavior and offline logic were checked automatically, not visually on a real iPhone.

Historical backtesting reports prediction error against recorded starts. It is not prospective clinical validation. Future ranges are heuristic and not calibrated probability guarantees. No wearable imports, automatic health-data integrations or machine-learning model are added in this release. Reminders remain foreground/open-time checks, not guaranteed background alarms.
