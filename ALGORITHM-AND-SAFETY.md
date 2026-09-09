# Orbit v12 — algorithm and safety notes

## What the forecast does

Orbit predicts the next period from up to 12 recent completed cycles. It gives recent cycles more weight, preserves long observed intervals and flags ambiguous history, and calculates an uncertainty width from recent variability. Future forecasts widen with horizon.

The date shown as an ovulation estimate is not a direct measurement. By default it is inferred by counting a luteal-phase estimate backwards from the expected next period.

## Physiological evidence

When available, Orbit also inspects manually logged:

- positive LH/ovulation tests;
- basal body temperature (BBT) for a sustained rise after six earlier readings;
- egg-white cervical fluid.

BBT is treated as retrospective evidence. Both the forecast and evidence panel exclude disturbed or invalid readings and require six consecutive baseline readings followed by three elevated readings. A positive LH test gives a short ovulation window rather than an exact guaranteed day. Cervical fluid is weaker evidence and broadens rather than certifies the estimate.

At least three LH/BBT-supported cycles can teach Orbit a personal luteal-phase median. Calendar-only cycles do not silently claim the same confidence.

## What it does not do

This implementation has not undergone prospective clinical validation and should not be described as medically more accurate than Clue, Natural Cycles, or another validated product without a head-to-head study.

It is not contraception, does not diagnose menstrual or fertility disorders, and cannot guarantee a future non-fertile day.

## Privacy model

The full tracker state stays in the device browser's local storage unless the user deliberately exports it. Partner share payloads contain cycle timing only; symptoms, moods, notes, BBT and weight are excluded structurally.

Live sync encrypts that minimal payload with AES-256-GCM. The key is derived from the shared passphrase with PBKDF2-HMAC-SHA256 at 600,000 iterations. Each encrypted payload gets a new random salt and IV. Supabase still receives ciphertext and timing metadata, so it should not be treated as metadata-free or anonymous infrastructure.

The local PIN is a convenience/privacy lock against casual access, not a replacement for the iPhone passcode and device encryption.

Pill mode pauses calendar forecasts. Historical backtesting uses only logs available at each previous start, and measures error against later recorded starts. The displayed ranges are heuristic; their coverage is not a validated probability guarantee. See UPGRADE-v12.md for the capability-based sync model and its limits.
