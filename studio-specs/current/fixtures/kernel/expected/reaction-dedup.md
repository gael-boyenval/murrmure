# Reaction dedup golden scenario

## Setup

- Rule: `fixtures/rules/linear.json`
- Reaction: `fixtures/reactions/on-transition-applied.json`
- Register reaction after aggregate exists (registered_at_seq = current max seq)

## Steps

1. Create aggregate
2. `state.transition` event `start` → journal `transition.applied`
3. Emit duplicate: replay same transition denied OR append second identical `transition.applied` via test hook (same dedup key)

## Expected

- `RecordingActionPort` invoke count === **1**
- Second matching entry: delivery_log shows `dedup_skipped` or no second attempt
- Journal may have 2 entries; side effect once (K18)

## Replay

4. `reaction.replay` with `bypass_dedup: true` → invoke count === **2**
