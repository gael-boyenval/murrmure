# Development Guardrails

## For each new development always follow : 

### phase 1 : have a conversation with human

Ask questions, give your opinion, push back. Always shorts messages.
Never uge block of text. The user may come with a specific implementation idea, but more important is first to understand the underlying goal, and through conversation, define the best course of action.

### phase 2 : write the required plan `studio-specs/plans`

The plan should include the goals and functional definition in introduction. The plan should include all conversation contexte, so that any agent in a new session, or subagent without knowledge of the main conversation can safely build the feature without functional guessses. 

**Slice by feature, not by architecture layer.** Each task is a vertical slice that leaves the product working — never “all persistence then all API”.

Each task should include a functional goal and user stories.

Each task must include, in one pass: **code, tests, `apps/docs`, `studio-specs/current`** (and changeset when a publishable package changes). No deferred docs/specs phases.

End every task with green: `pnpm typecheck && pnpm build && pnpm test` (and `pnpm test:acceptance` when in scope).

### phase 3 : execute the plan

**Orchestrator, not implementer.** Delegate ~90% of code writing to subagents. You sequence tasks, unblock, adjust the plan — rarely touch code yourself.

Loop until full completion of the plan:

- #1 - **Dev subagent** — implement the feature slice (code, boundary tests, docs, specs)
- #2 - **3 review subagents** in parallel (each carries multiple lenses):
  - **Scope & contract** — plan fidelity, scope creep, boundaries, breaking changes
  - **Failure & trust** — error paths, footguns, data/auth/security, recovery
  - **Experience & craft** — CLI/DX, terminology, tests at edges, surprises (good or bad)
- #3 - **Dev subagent** — you synthesize the 3 reviews into a fix list; delegate application (you do not code the fixes)
- #4 - back to #1 with next task (or re-run #2–#3 if the slice is not green)

Tests: close to 100% coverage at the boundaries (never implementation details).

When the plan is fully executed: move it to `studio-specs/archives`, update `studio-specs/ADR` if needed.

### gate : human validate all artifacts

No human gate during dev — only here, before publish.

### phase 4 : publish

npm packages: `@murrmure/flow-dev-kit`, `@murrmure/cli` only (see `.changeset/config.json`).

- per task: `pnpm changeset` when you touch a publishable package
- `pnpm version-packages` → commit (only when user asks) → tag `v*` + push → CI publishes via `release.yml`
- private packages only: commit, no changeset / version / tag
- never `pnpm release` locally unless user asks

- `studio-specs/plans` holds deferred scope; `studio-specs/archives` is historical-only — never implement from those.
- Reach for `.opensrc` when researching a feature or when looking for inspiration from how other tools implement similar features.
