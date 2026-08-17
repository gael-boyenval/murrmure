# Part 1 — Two spaces on one hub

**Concept:** A meeting seat lives in a **space**. Two spaces on the **same** local hub can sit in one room. You are not launching a second product.

## Before you start

- [Tutorial 1a](../01-local-preview-review-v3/) is done. Desktop is already running.
- Do **not** `mv ~/.murrmure` — that wipes 1a.
- Do **not** reuse `~/work/my-first-space`.
- One Desktop. One hub (`http://127.0.0.1:8787`).

## Step 1 — Why two folders

Designer and QA share the app repo. The researcher has a different repo. Same machine is fine. Federation is not this tutorial.

## Step 2 — Create `meeting-app`

```bash
mkdir -p ~/work/meeting-app && cd ~/work/meeting-app
git init
mrmr setup
```

Wizard: name/slug **`meeting-app`**. **Include example flow?** **No.** Connect tools? **Yes** (same as 1a). Reload. Call:

```text
murrmure_space_status
```

The response should identify this space’s `spc_…`.

Expected tree (no flows yet):

```text
meeting-app/
└── .mrmr/
    ├── dev/
    │   └── .gitignore
    └── space/
        ├── handlers.yaml
        └── space.yaml
```

`handlers.yaml`:

<!-- tutorial-meetings-fence:part-1-app-empty-handlers -->
```yaml
version: 1
handlers: []
```

`space.yaml`:

<!-- tutorial-meetings-fence:part-1-app-space -->
```yaml
apiVersion: murrmure.space/v1
slug: meeting-app
name: meeting-app
```

## Step 3 — Create `meeting-research`

In a **second terminal**, same wizard, different folder:

```bash
mkdir -p ~/work/meeting-research && cd ~/work/meeting-research
git init
mrmr setup
```

Name/slug **`meeting-research`**. **No** example files. Connect tools **for this space** (second `con_…`). Reload **that** context. `murrmure_space_status` must print the **research** `spc_…`, not the app one.

`handlers.yaml`:

<!-- tutorial-meetings-fence:part-1-research-empty-handlers -->
```yaml
version: 1
handlers: []
```

`space.yaml`:

<!-- tutorial-meetings-fence:part-1-research-space -->
```yaml
apiVersion: murrmure.space/v1
slug: meeting-research
name: meeting-research
```

## Step 4 — Two agent chats (do this now, talk later)

- Chat A: workspace = `meeting-app`. After reload, `murrmure_space_status` = app.
- Chat B: workspace = `meeting-research`. Status = research.
- If both chats report the same `spc_…`, stop — MCP is pointed at one connection. Run `mrmr space doctor --fix` **in the wrong folder**.

Use **two Cursor windows**, not one multi-root workspace (one connection per folder is the 1a model).

## Step 5 — Check Desktop

You should see:

- Sidebar lists **meeting-app** and **meeting-research** (1a’s space may still be there — ignore it)
- Each home: **no** runnable flow yet
- Still one hub — switching spaces does not start a second app

```bash
# in each folder
mrmr space status
mrmr doctor
```

## Fill the workspace card

Copy both `spc_…` and `con_…`. You will paste the space ids into the flow in Part 3.

```text
meeting-app:       folder ________  slug meeting-app       spc_ ________  con_ ________
meeting-research:  folder ________  slug meeting-research  spc_ ________  con_ ________
Desktop hub:       http://127.0.0.1:8787  (one app, not two)
Agent chat A:      opened on meeting-app
Agent chat B:      opened on meeting-research
```

## Checkpoint

- [ ] Two new folders; neither is `my-first-space`
- [ ] Sidebar shows **meeting-app** and **meeting-research**
- [ ] Each `.mrmr/` matches the trees above (empty handlers, no flows)
- [ ] Chat A and chat B report **different** `spc_…`
- [ ] Workspace card has both space ids and both connection ids

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Second setup created a second hub / empty sidebar | Second Desktop instance or reset `~/.murrmure` | Quit extras; one Desktop; do not move the state dir |
| Both chats same `spc_…` | One MCP config reused | Open the other folder; `mrmr space doctor --fix`; reload that tool |
| Example flow appeared | Said Yes to examples | Delete `.mrmr/flows/*`, apply, continue — do not “use the sample meeting” |
| `my-first-space` gone | State reset | Restore from backup if you have one; 1b does not require the 1a files on disk, only the skills |

## Next

[Part 2 — Advertise seats →](./02-personas)
