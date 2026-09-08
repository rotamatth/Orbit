# Tests

Two suites, no test framework — plain Node scripts that print pass/fail and exit non-zero
on failure.

```bash
cd tests
node logic.test.mjs          # 45 assertions, no dependencies
npm install jsdom
node dom.test.mjs            # 52 assertions, renders every screen
```

`logic.test.mjs` covers cycle detection, averages, forecasting, phase classification,
the share-code round trip, the privacy wall, encryption, PIN hashing, CSV export and
edge cases (no data, one cycle, malformed input).

`dom.test.mjs` boots the real app in jsdom with six cycles of seeded data, renders all
12 routes, exercises chip taps, settings, sheets, navigation and the full partner flow,
and asserts zero console errors across the run.

The three privacy-wall assertions in `logic.test.mjs` and the
"no symptom words leak into partner view" assertion in `dom.test.mjs` are the important
ones — see HANDOFF.md section 5.
