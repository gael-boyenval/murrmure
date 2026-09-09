---
name: memory-use
description: >-
  Use Murrmure memory tools (retain, recall, reflect, recent, retire) against
  this space's bank. Use on a cold start or when orienting in an unfamiliar
  space, when asking what we already decided, when a decision should survive
  the session, or when a stored fact is stale, wrong, or superseded.
version: 0.7.0
disable-model-invocation: true
---

# Memory use

Read `memory_bank` from `.mrmr/space/space.yaml`.

Each `bank` is a separate memory. A call never mixes banks. Default: pass this space's `memory_bank`. Read another bank only when `AGENTS.md` names it. Write to this space's bank unless `AGENTS.md` says otherwise.

Memory is so a cold agent reaches standing knowledge faster. When you have a question that should already have an answer, read first. If nothing is there, go get it — operator, research, or exploration — then `retain` what you found. Retain the answer, not the gap.

When a retained fact is wrong or superseded, `retire` it. Keep it clean. Keep it current.

## What memory is not

Read this before proposing anything memory "should also" hold.

- **Not access control.** Only `tags` are enforced. `subjects` are a ranking tilt with no enforcement — they cannot hide a fact from anyone. Refuse any request shaped as "put it on a subject so X can't see Y".
- **Not a log or a task tracker.** A finished ticket, a plan still in motion, session notes — none of it.
- **Not a transcript store.** A mixed transcript retained as one write is the failure mode, not a shortcut.
- **Not a document store.** A passage is chunked, extracted, and discarded. You cannot get your text back.
- **Not a cache of derived output.** Never retain `reflect` prose. It freezes a model that should be recomputed.
- **Not a replacement for the repo.** Anything re-derivable by reading — paths, command lists, test inventories — goes stale silently and belongs in the code or `AGENTS.md`. Memory holds what reading cannot tell you: why a call went that way, what broke last time, what the default is when the spec is silent.
- **Not a place for the gap.** Retain the answer you went and got, never "I don't know".
- **Not cross-space.** No promote, no drop, no read across banks. By design, not omission.

## Ambient duty

Using this bank is part of the job, not a side task. Read, retain, and retire without being asked.

This skill cannot ask that of you on its own: it loads only when named. The duty has to live in a file that is always applied. Put these lines in the space's `AGENTS.md` or an always-applied rule:

```text
Memory is part of the job. The bank is `memory_bank` in `.mrmr/space/space.yaml`.
Read memory before deciding something that should already be decided.
Retain after a decision that should survive the session. Retire what is wrong.
The `memory-use` skill is the reference for how.
```

Without that, no agent in the space reaches this file on its own.

## How to use

Before changing something that should already have been decided, read memory. `reflect` is the picture (summary, stance, mental model). `recall` is the rows. Prefer `reflect`. Use `recall` when you need a specific fact — to cite, check, or `retire`. On those reads, pass the `subjects` that match the question (often more than one). Omit only if the question has no concern.

After a decision that should survive this chat: `retain` it. Write a short passage, not the transcript. Extraction will split it into facts. Those facts all inherit this write's subjects.

When a retained fact is wrong or superseded: `retire` it.

Do not retain information that is too short-lived. Examples: a task just completed, a plan still in motion, session notes.

**One concern per write.** This is a limit, not a preference. Extraction blurs a passage that spans two topics: a write naming two tools and two vocabularies came back as one fact that conflated them, and ranked first on the next read. If your passage needs more than one concern, it is more than one write.

This limit counts concerns, not subjects. **A concern is a topic; a subject is an axis. One topic legitimately sits on several axes.** A single write about where notes get filed is one concern and belongs on both `architecture` and `placement` — narrow passage, stacked label, no conflict. Do not read "one concern per write" as "one subject per write".

### Verify your write

`retain` returns the facts it extracted. Read them. Extraction drops clauses, and it does not drop them predictably — a prohibition can survive while the descriptive half vanishes, or the reverse. The call still returns success.

If something you meant to persist is not in a returned row, rewrite that point as its own plain sentence and retain it again. An instruction that did not survive extraction is not in memory, however well the passage read.

**Name the referent. Never "those two", "that one", "the former", "it".** Extraction resolves a cross-sentence pointer against the wrong noun, and the result is not a gap you can spot — it is a well-formed, confident, false row that then ranks first. One write said a rule held "on those two tools", meaning the two just named; it came back asserting the rule held on two nouns from an earlier sentence. Repeating the noun costs a word. This failure costs a fact you will believe.

One loss is predictable enough to write around: **a prohibition that only mirrors the positive claim beside it gets absorbed into it.** "The rich document goes in canon, the session file is a thin stub. Do not leave the cookbook under `notes/sessions/`." — the second sentence adds no new content, and extraction deduplicates it away. Prohibitions that carry their own content survive. If a rule matters, give it something to say that the sentence before it does not already say.

**Check `ignoredSubjects` on every retain response.** Subject validation is split-brain on partial matches: a list where every name is unknown is rejected loudly, but mix one unknown name with one valid name and the write **succeeds**, narrowed to the valid ones, `status: ok`. The unknown name comes back in `ignoredSubjects` and nowhere else. Reads on that stripped subject then fail, so the row you believed you labelled can never be recalled the way you meant to recall it. A loud failure costs one turn; this costs a bank of mislabelled rows nobody notices until a `reflect` comes back thin.

### Reading defaults that bite

- `recall` with no `factTypes` returns all three kinds. Once consolidation has run, an observation *replaces* the raw facts it stands on where one is in the window — so on a young bank you see raw rows and on a mature one you may not. Do not read a first result as proof of what the bank returns in general.
- An empty `subjects` or `tags` list is not "no filter". Omit the argument to leave a scope unfiltered; do not pass `[]`.
- Rows written with no subjects compete normally on every read. An empty result is not proof the bank is empty on that axis.

## Retire

You cannot retire a summary. `reflect` gives prose; `recall` or `recent` give rows with ids. Take the id off the row.

**When the next move is `retire`, ask for the raw rows: `recall` with `factTypes: ["world", "experience"]`.** Left to the default, a consolidated bank can hand you observations standing in place of the facts underneath them, and you will retire the summary layer while what it was built from stays. This does not bite on a young bank, where no observations exist yet — which is exactly why it is easy to miss until the bank matters.

Ids come back as bare identifiers. Do not expect a prefix, and do not assume you have the wrong row because it does not look like the ones in these examples.

**Wrong versus merely old.** Retire when the fact would mislead someone acting on it today: it is false, it was reversed, or its horizon passed. Do not retire a fact for being old, narrow, or awkwardly worded. Age is not a defect — a settled decision from a year ago is still the decision.

**A fact this space did not write.** If it is in this bank, it is this space's to keep clean. Retire it on the same test as any other row. Probe rows, smoke-test rows, and leftovers from another agent's session are retirable without asking.

**Two live facts that contradict.** Do not retain a third fact explaining which one wins — that leaves both wrong rows in place and adds a tiebreaker nobody will read. Decide which is false and retire it. If both are true but of different eras, the superseded one is the one that goes, and its replacement is a `reversal`.

`reason` is read by the next agent that wonders where the fact went. One line, same shape as `context`: a kind, optionally the occasion.

| kind | when |
|---|---|
| `wrong` | it was never true |
| `superseded` | replaced by a later call |
| `expired` | horizon passed |
| `short-lived` | should not have been retained |

## Subjects

Pick `subjects` from the `subjects` enum on the tool you are calling. That enum is served by the same process that validates the write, so it cannot reject a name it just offered you. Do not invent names. Do not copy the list into anything.

[`subjects.yaml`](subjects.yaml) beside this skill is the shared core handbook — one list, the same for every bank. It is what the engine loads, not a list you read to choose from. If it disagrees with the enum, the enum is what will be enforced today; the file is not wrong, it is ahead.

Prefer more than one subject. A fact usually sits on several axes. Use one name only when it truly fits just one.

Three names in that enum sit close enough to be confused, so choose them deliberately:

- **`ai-harness`** — how agents are set up to do the work: skills, rules, prompts, the tools they call. Which model a skill invokes is `ai-harness`.
- **`evidence`** — what proves the work correct: tests, evals, fixtures, gates, measurements. What the eval asserts, and why a gate passes, is `evidence`.
- **`ops`** — how the thing runs and is operated: deploys, environments, restarts, daemons, credentials, incidents. That a server reads its config once at boot is `ops`.

A fact about the harness *that measures* is `ai-harness` and `evidence` both, and that is a genuine both rather than a hedge. A fact about restarting the process that serves the vocabulary is `ops`, even though the vocabulary is an `ai-harness` concern — the restart is the operable half.

Where a shared handbook is loaded, `subjects` is **required** on `retain` — the same tool name carries a different contract than it does in a space without one. If a write is refused for a missing subject, that is why.

Subjects are a recall tilt, not a wall. They rank; they do not partition, filter, or protect. Two consequences worth holding: a subject cannot keep a fact away from anyone, and every fact from one write carries that write's full subject list — so a broad passage over-labels every atom in it. That is the cost of stacking names on a wide write, and the reason the one-concern-per-write limit is a limit.

## Tags

`tags` are visibility, not ranking. Not subjects. A fact lives in one bank and can carry **many** tags — `retain.tags` is a list; send several at once when more than one scope should see the row.

For now, tags are only:

- **persona** — a specialist agent (QA, designer, …), not an end-user (`ontology`)
- **action** — a step in the work (what is being done)

**Names:** lowercase, hyphens, prefix required.

| kind | form | example |
|---|---|---|
| persona | `persona:<id>` | `persona:qa` |
| action | `action:<verb-object>` | `action:test-user-journey` |

No spaces. Do not invent prefixes. Combine when both apply. Omit tags when the fact is for the whole space (unscoped = shared). Do not reuse subject names.

## Context

`context` is optional framing on `retain`. The engine shows it to the extractor and stores it on every fact from that write. It does not filter recall.

One line: **kind**, optionally **what you were in the middle of**. Not the story. Not tags. Not subjects. The finding stays in `content`.

| kind | when |
|---|---|
| `decision` | a call that should stick |
| `finding` | something learned while doing the work |
| `reversal` | we no longer hold a prior call |
| `goal-short` | a near-horizon objective |
| `goal-long` | a far-horizon objective |
| `research` | a sourced finding; occasion **is** the cite |

Form: `kind` or `kind: short occasion`. Empty is fine, except `research` (source required) and goals (`goal-short` or `goal-long`).

**`research` and `goals` are each two different things in this file, and the collision is real.** `research` is a `context` kind *and* a subject; `goals` governs which `context` kinds are legal *and* is a subject. They do not travel together: `subjects: ["research"]` says what the fact is about and carries no source obligation, while `context: "research: <url>"` is the obligation and is what a missing cite refers to. One does not imply the other, and neither field validates the other. Read the field name before the token.

```text
goal-short: Q4 checkout
finding: while test-user-journey
decision
research: https://example.com/rfc
research: docs/auth.md
```

## Examples

`bank` is this space's `memory_bank`. Stories use `checkout`. The subject names below are the handbook's; check them against the enum on the tool before copying a call verbatim, since the running engine may be serving an older list.

`retain` takes a **passage**, not one sentence. The engine splits it into atoms. Every atom inherits this write's subjects, tags, and context — so the whole passage must belong on those axes. Do not paste a transcript. Do not mix a mission, a bug, and a goal in one write.

**Orient.** Cold start. You need a mental model of the job, not a pile of rows. `reflect` combines identity, product, and goals into one picture so you start on the current work instead of asking “what is this repo.”

```json
reflect({
  "bank": "checkout",
  "query": "What is this space and where is it heading?",
  "subjects": ["identity", "product", "goals"]
})
```

**Before a change.** About to move payments. `reflect` folds architecture, placement, and history: where it lives, what we already refused. You act from that stance. `recall` here would dump paths and old decisions without saying what to do.

```json
reflect({
  "bank": "checkout",
  "query": "What should I do about moving payments?",
  "subjects": ["architecture", "placement", "history"]
})
```

**Hunt, then trail.** You need the actual location. `recall` is right: you want rows, not a summary. Empty means go get it (explore), then `retain` a passage the extractor can split — here vs there, what lives in the tree, what not to add.

```json
recall({
  "bank": "checkout",
  "query": "Where do payments live?",
  "subjects": ["architecture", "placement"]
})
```

Empty. After exploration:

```json
retain({
  "bank": "checkout",
  "content": "Card charges live in this space under billing/: authorize, capture, and refund all go through that package. HTTP handlers are in billing/api. Payment-provider webhooks are not this space's job — they belong to the ledger space. Do not add webhook routes here. Refunds that need ledger state call ledger over the internal API; they do not reach into ledger's tree.",
  "context": "finding: while locating payments",
  "subjects": ["architecture", "placement"]
})
```

Why this is a good write: several facts (tree, handlers, other space, a non-goal), all on architecture+placement. Next cold agent `reflect`s and already has the model. The gap (“I don’t know”) would have been a useless atom.

**Names.** Operator settled what we call people. One passage, ontology+product: entities, labels, what is not in the model. Next agent stops inventing “user” / “shopper” in copy and code.

```json
retain({
  "bank": "checkout",
  "content": "End users of checkout are members, not users or shoppers, in product copy and in code. A member has a cart and places an order. The payment provider is not a member. Coding-agent seats (QA, designer) are not domain entities — they are not part of this ontology.",
  "context": "decision",
  "subjects": ["ontology", "product"]
})
```

**Goal.** A current stream needs a horizon. `context` carries short vs long. The passage can name what is in and what is out so extraction gets both the aim and the non-scope. Retire when the horizon passes.

```json
retain({
  "bank": "checkout",
  "content": "Short-term: ship guest checkout without account creation by the end of Q4. That is the current stream. The wallet rewrite is a long-term goal and is not this quarter's scope. Do not pull wallet work into Q4 guest checkout.",
  "context": "goal-short: Q4 guest checkout",
  "subjects": ["goals", "product"]
})
```

**Preference.** How to work with this operator. Not tools, not skills. Retain once so every later chat does not re-learn it.

```json
retain({
  "bank": "checkout",
  "content": "The operator wants a recommendation, not a menu of options. Do not list alternatives unless asked. Think out loud only when a trade-off is real. Prefer a short answer, then the work.",
  "context": "decision",
  "subjects": ["preference"]
})
```

**Research, then model.** You looked it up. Finding stays in `content`; cite in `context`. Write enough that extraction can split default vs this product's exception. Later `reflect` builds a belief from several sources. Do not retain the reflect prose — that would freeze a stale copy of the model.

```json
retain({
  "bank": "checkout",
  "content": "Set-Cookie SameSite defaults to Lax. Lax sends the cookie on top-level GET navigations, not on cross-site POST. Checkout's PSP callback is a cross-site POST, so Lax drops the session cookie on that request. That callback needs SameSite=None and Secure. Do not set SameSite=None on the first-party session cookie used by checkout pages.",
  "context": "research: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite",
  "subjects": ["research", "architecture"]
})
```

```json
reflect({
  "bank": "checkout",
  "query": "What do we believe about cookies on checkout?",
  "subjects": ["research", "architecture", "product"]
})
```

**Scoped write.** A flake is for the QA seat on this action, not the whole space. Tags are visibility. The passage is still a real finding, not “I ran the test.”

```json
retain({
  "bank": "checkout",
  "content": "Guest checkout signup flakes when the member already has an email in the PSP test vault: the UI shows success, the order is missing. Re-run is not enough — clear the vault email before the journey. This is not a product copy issue.",
  "context": "finding: while test-user-journey",
  "tags": ["persona:qa", "action:test-user-journey"],
  "subjects": ["product", "process"]
})
```

**Clean.** `reflect` on goals looks stale. You cannot retire a summary — `recall` the row, then `retire`. If a prior call is dead, retain a reversal as a passage: what we stopped, why, what to do instead.

```json
reflect({
  "bank": "checkout",
  "query": "What are we aiming at for checkout?",
  "subjects": ["goals"]
})
```

```json
recall({
  "bank": "checkout",
  "query": "ship flags by June",
  "subjects": ["goals"]
})
```

```json
retire({
  "bank": "checkout",
  "id": "<id from the recall row>",
  "reason": "expired: June flags horizon passed"
})
```

```json
retain({
  "bank": "checkout",
  "content": "We no longer use a separate payment queue. That path was tried; it added lag and double-charge risk. Charges now go through billing/ in-process. Do not revive the queue worker or enqueue charge jobs.",
  "context": "reversal",
  "subjects": ["history", "architecture"]
})
```

### Don't

Gap, not the answer. Extraction would store “we don’t know.” Next `reflect` is worse.

```json
retain({
  "bank": "checkout",
  "content": "I don't know where payments live.",
  "subjects": ["architecture"]
})
```

Short-lived mixed with standing facts. Every atom inherits identity+goals+product. The ticket, the mission, and a flake would all rank on all three.

```json
retain({
  "bank": "checkout",
  "content": "Finished the ticket. This space is for checkout. Next: rewrite billing. Found a flake on signup.",
  "subjects": ["identity", "goals", "product"]
})
```

Invented subject `checkout` (that is the bank, not a subject); end-user as a tag where it is an `ontology` fact; two unrelated facts in one write. The `research` subject is not the miss here — a subject carries no cite obligation. The miss is that nothing in this write is a sourced finding, so `research` is simply the wrong axis.

```json
retain({
  "bank": "checkout",
  "content": "Shoppers are called members. SameSite defaults to Lax.",
  "tags": ["persona:shopper"],
  "subjects": ["checkout", "research"]
})
```

Retain of reflect output. Freezes a summary that will drift. Reflect again next time.

```json
retain({
  "bank": "checkout",
  "content": "<paste of the reflect answer about payments>",
  "context": "decision",
  "subjects": ["architecture"]
})
```

Also don't: skip the read and re-ask a standing fact; wait to be told “save that”; `recall` a pile and self-summarize when `reflect` would do it; `reflect` when you needed the row; treat an empty `reflect` as knowledge.

