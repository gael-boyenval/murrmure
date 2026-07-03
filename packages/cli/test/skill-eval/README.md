# Skill eval fixtures (advisory only)

**Not a CI merge gate** — see [decision 12](../../../../studio-specs/plans/product/plan/decisions/12-skill-eval-advisory-only.md).

Run manually at release: load the installed `murrmure` skill, send each `prompt` to an agent, check ≥5/6 fixtures match `expected_keywords`.

```bash
ls packages/cli/test/skill-eval/*.json
```

Each fixture:

```json
{
  "id": "…",
  "prompt": "…",
  "expected_keywords": ["…"],
  "advisory": true
}
```

Pass criterion: response contains all (or majority of) keywords for that fixture.
