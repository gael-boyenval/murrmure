# Improvement request: Tutorial Part 1 site layout vs test env

## Topic

docs

## Summary

Tutorial Part 1 (`01-create-the-repo.md`) assumes a minimal static site with `index.html` at the **repo root** and `npm run dev` serving `.` on port 3000. The tutorial test environment repo **agentStudioTestEnv** (space `spc_my_space`) instead places the site under **`app/web/`** — there is no root-level `index.html`.

Following Part 1 literally in that repo creates a mismatch: setup, preview, and build-agent discovery steps that reference the root site do not align with where the actual product lives.

## Suggestion

Add an explicit note in Tutorial Part 1 that the canonical test env uses `app/web/` (not a root `index.html`), and align setup/preview steps with that path:

1. **Part 1 (`01-create-the-repo.md`)** — After the minimal-site example, add a short callout: *"If you are following along in **agentStudioTestEnv**, the site already lives under `app/web/`; use that directory for dev server and file edits instead of creating a root `index.html`."*
2. **Align paths in later parts** — Where Part 2+ references the site root, preview URL, or files the build agent should change, point to `app/web/` (or `app/web/index.html`) when the reader is using the test env.
3. **Checkpoint checklist** — Update Part 1 checkpoint items to mention both layouts: root `index.html` for greenfield readers, `app/web/` for agentStudioTestEnv.

Optional: link to agentStudioTestEnv in the tutorial index so readers know which layout they are on before Part 1.

## Context

- **Repo / space:** `/spaces/spc_my_space` (tutorial repo: **agentStudioTestEnv**)
- **Workflow:** Tutorial 1 — Local preview review, Part 1 — Create the repo
- **Docs path:** `apps/docs/guide/tutorials/01-local-preview-review/01-create-the-repo.md`
- **Assumption in docs:** `index.html` and `package.json` at space root; `npx serve . -l 3000`
- **Actual test env layout:** Site under `app/web/` (no root `index.html`)
- **Friction:** Readers cloning or using agentStudioTestEnv hit path confusion when Part 1 steps do not match the repo structure

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYAZN8HGVJCJ7FQVSBJKKMH`
- Run: `run_01KWYAZN8JJF0DF0DSSQBCCPE5`
