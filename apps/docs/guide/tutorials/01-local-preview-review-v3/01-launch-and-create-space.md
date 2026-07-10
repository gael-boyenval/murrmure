# Part 1 — Launch Desktop and create your space

Open the app, understand what you're looking at, create your first space, connect your agent.

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

## Step 2 — Create your first space

### Pick a project folder

```bash
mkdir -p ~/work/my-first-space && cd ~/work/my-first-space
git init
```

### Install the CLI

Desktop is waiting for a folder on your computer — but the linking happens from the **terminal**, in that folder. That's what the **CLI** (`mrmr`) is for.

It's a small command you install once. You use it to:

- **Connect a project folder** to the Murrmure app you just opened
- **Set up** the `.mrmr/` config Murrmure needs in that folder
- **Publish** that config so Desktop picks it up (that's when your project appears in the list)
- **Connect your agent** — the wizard prints an MCP snippet; your agent tool launches `murrmure-mcp` separately from Desktop

You won't live in the terminal day to day — humans use the Desktop app. The CLI is mostly for this first-time setup and for things you'll author later (workflows, config). Right now, it does what the on-screen guide is asking you to run.

```bash
npm install -g @murrmure/cli
mrmr setup
```

The wizard does what the Desktop screen describes — init, link, apply — in one guided pass. Confirm each step:

**Connect** — links the CLI to the Desktop you have open.

**Spaces** — creates the space on the hub. Name it `my-first-space`.

**Init** — creates `.mrmr/` in your project folder. When asked **Include example flow and starter files?**, choose **No** — Part 2 adds your own flow from scratch.

**Link** — binds this folder to the space you just named.

**Apply** — publishes `.mrmr/` so Desktop can see it. Watch the sidebar: your space should appear while the wizard runs.

**Skill** — optional platform skills that teach agents how to use Murrmure's tools. Accept if your agent supports them.

**Grant** — mints a token for your agent and prints an MCP config snippet. Copy it — next step.

Set the space slug in `.mrmr/space/space.yaml` to match the name you picked:

```yaml
apiVersion: murrmure.space/v1
slug: my-first-space
```

Publish again:

```bash
mrmr space apply
```

### Connect your agent

The **Grant** step printed a config block. Paste it into your coding agent's MCP settings — see [Connect your agent (MCP)](../../agents-mcp) for where each tool keeps that file.

Desktop ships the agent connector — the snippet points at the copy inside the app, not a separate install.

Reload your agent, then ask:

> Call `murrmure_space_status` and tell me my space name.

If it works, you're done.

## Step 3 — Check Desktop

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
- [ ] `.mrmr/` exists with empty `handlers.yaml` and no example flow
- [ ] Your agent answers a `murrmure_space_status` call

## Next

[Part 2 — Build a minimal two-step flow →](./02-build-minimal-flow)
