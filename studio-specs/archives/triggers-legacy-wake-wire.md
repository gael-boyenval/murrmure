# Triggers — legacy wake wire (removal record)

**Status:** Archived. Not normative. Kept for traceability after Task 15 Lane C cutover.

The retired trigger-action wake wire (`action.type` legacy preset, HTTP wake route, pending-wake queue) is gone. New spaces use:

- `on: event:` handlers in `.mrmr/space/handlers.yaml`
- `murrmure_emit_event` (`event:emit` capability)
- Flow triggers (`mrmr flow run`)

Registration of legacy wake-wire actions returns `422 TRIGGER_ACTION_RETIRED`. Historical template ids (`spec-published-wake-dev`, `work-ready-wake-frontend`) are listed read-only for migration reference.

See [../current/triggers/spec.md](../current/triggers/spec.md) for the clean protocol.
