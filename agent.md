# Development Guardrails

## For each new development always follow : 

### phase 1 : have a conversation with human

Ask questions, give your opinion, push back. Always shorts messages.
Never uge block of text. The user may come with a specific implementation idea, but more important is first to understand the underlying goal, and through conversation, define the best course of action.

### gate 1 : human validate the general Idea, and functional definition (no writen artifacts)

### phase 2 : write the required plan `studio-specs/plans`

The plan should include the goals and functional definition in introduction.

### gate 2 : human validate the plan

### phase 3 : execute the plan

Act as an orchestrator that will loop until full completion of the plan.

loop model : 

- #1 - Run subagents for individual tasks/phases
- #2 - Run subagents to review individual tasks/phases
- #3 - Add your own review
- #4 - back to loop #1 with next task

Always write (or instruct subagents) tests to test close to 100% coverage at the boundaries (never implementation details)


### phase 4 : update `apps/docs`

### phase 5 : update `studio-specs` 
maintain current up to date
move executed plan and stale specs in `studio-specs/archives`
maintain and `studio-specs/ADR` directory

### gate 5 : human validate all artifact

### phase 6 : publish

commit, create a tag bump versions and publish to npm

- Keep `apps/docs` and the normative specs in `studio-specs/current` up to date with each new development change. `studio-specs/plans` holds deferred scope and `studio-specs/archives` is historical-only — never implement from those.
- Reach for `.opensrc` when researching a feature or when looking for inspiration from how other tools implement similar features.
- Write tests to cover every development change.
