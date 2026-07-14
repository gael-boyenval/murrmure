# Part 1 — Launch Desktop and create your space

Open the app, understand what you're looking at, and create your first space.

## Step 1 — Open Murrmure Desktop

Install and launch Desktop — see [Murrmure Desktop](../../desktop).

The app opens and invites you to **create your first space**. You should see:

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

The wizard uses the already-running Desktop Hub authorization, then creates one
named space, scaffolds, links, applies, and offers to connect local tools in one
guided pass.

**Space** — asks for a human-readable name defaulted from the current folder,
then shows an editable slug. Confirm `my-first-space` for both in this tutorial.
The Hub assigns a separate immutable `spc_…` ID.

**Init** — creates `.mrmr/` in your project folder. When asked **Include example flow and starter files?**, choose **No** — Part 2 adds your own flow from scratch.

**Link** — binds this folder to the space you just named.

**Apply** — publishes `.mrmr/` so Desktop can see it. Watch the sidebar: your space should appear while the wizard runs.

**Skill** — optional platform skills that teach tools how to use Murrmure.

**Connection** — when asked **Connect tools on this computer?**, choose **Yes**.
Select your detected integration context (or the generic portable-instructions
option). Setup creates one `tutorial-builder/v1` connection for this computer
and reuses it in every selected context. It stores the credential in macOS
Keychain; generated configuration and project files contain only a `con_…` ID.

Reload each selected tool when prompted, then call:

```text
murrmure_space_status
```

The response should identify `spc_…` for `my-first-space`.
`murrmure_resolve_step` should also appear in the tool catalog. The default
profile grants exactly `space:read`, `flow:read`, `flow:run`, and
`step:resolve`; it does not grant raw journal or legacy action/gate access.

The confirmed name and slug are written consistently during setup; no manual
`space.yaml` repair or second apply is required.

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

<!-- tutorial-v3-fence:part-1-empty-handlers -->
```yaml
version: 1
handlers: []
```

`space.yaml`:

<!-- tutorial-v3-fence:part-1-space -->
```yaml
apiVersion: murrmure.space/v1
slug: my-first-space
name: my-first-space
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
- [ ] One `con_…` connection is installed in every selected context
- [ ] After reload, `murrmure_space_status` succeeds and no generated file contains a token

## One-time reset for earlier development builds

This release intentionally has no seed migration or compatibility reader. If
you previously ran a development build, quit Desktop and move the old local
state aside once:

```bash
mv ~/.murrmure ~/.murrmure.pre-tutorial-v3-$(date +%Y%m%d-%H%M%S)
```

The next launch creates fresh empty storage. This does not delete the backup.

## Next

[Part 2 — Build a minimal two-step flow →](./02-build-minimal-flow)
