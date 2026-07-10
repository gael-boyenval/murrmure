# Part 1 — Create the repo

A **space** starts as an ordinary git repository. No Murrmure files yet — just the product you will change.

## What you are building

A folder that could be any static site project. Murrmure adds orchestration later; the site comes first.

## Step 1 — Create the directory

```bash
mkdir -p ~/work/my-feature-site && cd ~/work/my-feature-site
git init
```

This path becomes the **space root** — the directory `mrmr space link` will bind to a hub space.

## Step 2 — Minimal site

`index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>My feature site</title></head>
  <body>
    <h1>Hello</h1>
    <p>The agent will change this page after you attach a spec.</p>
  </body>
</html>
```

`package.json`:

```json
{
  "name": "my-feature-site",
  "private": true,
  "scripts": {
    "dev": "npx --yes serve . -l 3000"
  }
}
```

## Step 3 — Verify the dev server

```bash
npm run dev
```

Open `http://localhost:3000`. The **build agent** will discover this URL during a run — you do not pass it at intake.

## Step 4 — Prepare a spec (outside the repo)

The spec does **not** live in the repo before a run. Save it anywhere on your machine:

`~/Documents/hero-section.md`:

```markdown
# Hero section

Add a hero block above the heading:

- Headline: "Ship features with confidence"
- Subtext: one short sentence
- Button: "Get started" → `#signup`
```

You will attach this file at **intake** in Part 8.

## What is intentionally missing

| Not in repo yet | Added in |
|-----------------|----------|
| `.mrmr/space/` | Part 2 (setup wizard) |
| `agent.md`, `skills/` | Part 3 |
| `specs/current/`, `specs/archive/` | Created by agent during a run |

Part 2 scaffolds `.mrmr/space/space.yaml`, `.mrmr/flows/`, and `.mrmr/views/`. Compare with the [preview-review-v2 `.mrmr/` tree](../../../../examples/flows/preview-review-v2/.mrmr/) when you reach Part 2.

## Checkpoint

- [ ] Git repo with `index.html` and `package.json`
- [ ] `npm run dev` works
- [ ] Spec `.md` file saved **outside** the repo

## Next

[Part 2 — Setup wizard →](./02-setup-wizard)
