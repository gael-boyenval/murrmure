# Improvement — “Needs you” should not list failed runs

## Topic

Desktop shell — notifications / **Needs you** inbox

## Summary

The **Needs you** surface (header badge, `/notifications` inbox, and related “needs attention” lists) currently includes **failed runs**. Failed runs should **not** appear there. “Needs you” should mean actionable human work (e.g. pending gates), not terminal failure history.

## Suggestion

1. Exclude run-failure notification kinds from the **Needs you** count and list.
2. Keep failed-run visibility on Space Home / session / run views (Recent completed, failed lifecycle badges, etc.) — not in the actionable inbox.
3. Update specs/stories that describe the inbox as “gates + run failures” so failures are out of scope for **Needs you**.
4. Ensure dismissing/resolving gates alone drives the badge; a failed run must not keep the bell non-zero.

## Context

Manual testing — Desktop **Needs you** after tutorial / flow runs that failed (2026-07-17).

## Source

Manual testing session — Desktop notifications (2026-07-17)
