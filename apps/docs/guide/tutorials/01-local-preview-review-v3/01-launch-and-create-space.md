# Part 1 — Launch Desktop and create your space

Open the app, understand what you're looking at, and create your first space.

## Step 1 — Open Murrmure Desktop

Install and launch Desktop — see [Murrmure Desktop](../../desktop).

The app opens and invites you to **link your first space**. You should see:

- **No projects yet** — the list on the left is empty (*No spaces linked yet*)
- **A short guide** in the center — pick a folder on your computer, run a few terminal commands, and your project will show up here
- **Copy buttons** next to each command, if you want to paste them yourself
- **A waiting indicator** — Murrmure is ready; it's waiting for you to link a folder

No account to create. No password. Just: pick a project folder and connect it.

### What's a space?

That's what this page is asking for — a **space** is one project: a folder on your computer, linked to Murrmure. Your code stays there. Murrmure just knows about it.

Let's create one.

## Step 2 — Pick a folder and install the CLI

### Pick a project folder

```bash
mkdir -p ~/work/my-first-space && cd ~/work/my-first-space
git init
```

### Install the CLI

Desktop is waiting for a folder on your computer — but the linking happens from the **terminal**, in that folder. That's what the **CLI** (`mrmr`) is for.

It's a small command you install once. You use it to connect a project folder to Desktop, scaffold `.mrmr/`, and publish that config so your space appears in the sidebar.

You won't live in the terminal day to day — humans use the Desktop app. The CLI is mostly for this first-time setup and for things you'll author later (workflows, config).

```bash
npm install -g @murrmure/cli
```

## Step 3 — Run the setup wizard

From your project folder:

```bash
mrmr setup
```

The wizard does what the Desktop screen describes — connect, create the space, scaffold, link, apply, and connect your agent — in one guided pass. Confirm each step:

**Connect** — links the CLI to the Desktop you have open.

**Spaces** — creates the space on the hub. Name it `my-first-space`.

**Init** — creates `.mrmr/` in your project folder. When asked **Include example flow and starter files?**, choose **No** — Part 2 adds your own flow from scratch.

**Link** — binds this folder to the space you just named.

**Apply** — publishes `.mrmr/` so Desktop can see it. Watch the sidebar: your space should appear while the wizard runs.

**Skill** — optional platform skills that teach agents how to use Murrmure's tools. Accept if your agent supports them.

**Grant** — connects your coding agent (MCP). The wizard prints the token, MCP config, and what to do next — follow its prompts through reload and verify. Everything for agent setup lives in that step; there is no separate procedure here.

Set the space slug in `.mrmr/space/space.yaml` to match the name you picked:

```diff
 apiVersion: murrmure.space/v1
-slug: my-space
+slug: my-first-space
```

Publish again:

```bash
mrmr space apply
```

When the wizard is done, your project should have a **`.mrmr/`** directory like this (no flows yet — Part 2 adds those):

```text
my-first-space/
└── .mrmr/
    ├── dev/
    │   └── .gitignore          # local runtime outputs (gitignored)
    └── space/
        ├── handlers.yaml       # empty — you add handlers in Part 2
        └── space.yaml          # slug matches your space name
```

`handlers.yaml`:

```yaml
version: 1
handlers: []
```

`space.yaml`:

```yaml
apiVersion: murrmure.space/v1
slug: my-first-space
```

## Step 4 — Check Desktop

Click your space in the sidebar. You should see the space home. Nothing to run yet — Part 2 adds the workflow.

```bash
mrmr space status
mrmr doctor
```

Both should pass without errors.

## Checkpoint

- [ ] App opens inviting you to link a space; project list is empty
- [ ] After setup, **my-first-space** appears in the sidebar
- [ ] `mrmr space status` shows your project folder linked
- [ ] `.mrmr/` matches the layout above (empty handlers, no flows)
- [ ] Wizard **Grant** step completed (agent connected per wizard instructions)

## Next

[Part 2 — Build a minimal two-step flow →](./02-build-minimal-flow)
