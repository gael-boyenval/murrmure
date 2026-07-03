# UI/UX Critique — Sidebar (`sidebar.stories.snapshots`)

**Reviewed:** 2026-07-01 (CC-10 snapshot refresh)  
**Snapshots reviewed:** `default.png`, `empty.png`  
**Component scope:** `@murrmure/shell-ui` Sidebar primitives — product-faithful AppShell fixtures  
**Product intent (spec):** Sidebar lists **Spaces** and **Sessions** with badges; header carries **Needs you (n)**; observer-first navigation chrome for operators triaging live work.

**CC-10 status:** Addressed in stories — generic Home/Flows/Settings retired; Spaces + Sessions + badges + New space footer + empty state. Snapshots regenerated via `pnpm storybook:build`.

---

## Context

Stories now mirror Murrmure observer IA from `philosophy.md` and `AppShell`: **Spaces** header, named space rows with pending-gate count badges, a **Sessions** group with status badges (`Gate`, `Partial`, `Working`), and a **New space** footer CTA. The `Empty` story captures first-run “No spaces linked yet.”

Header **Needs you (n)** and `NotificationBell` remain outside this primitive story — composite chrome snapshots in `shell-web` cover that surface.

---

## Strengths

| Area | Observation |
|------|-------------|
| **Product IA** | Spaces + Sessions groups match philosophy navigation model; generic Workspace/Home/Flows removed. |
| **Badge vocabulary** | Space pending-gate counts use numeric `warning`; session statuses use CC-08 variants (`gate`, `failed`, outline Working). |
| **Active state** | Selected space/session uses accent pill; `aria-current="page"` on active rows. |
| **First-run** | Empty story shows CLI-first path via New space footer without misleading nav items. |
| **Visual language** | Dark theme, restrained typography, and density align with Vercel-inspired shell stack. |

---

## Remaining gaps (out of CC-10 scope)

| Area | Observation | Severity |
|------|-------------|----------|
| **Header chrome** | Needs you badge / NotificationBell not in sidebar primitive stories | 3 |
| **Hidden space** | No “Private space” label fixture (spec §6.4) | 2 |
| **Long-list scroll** | No overflow snapshot for many spaces/sessions | 2 |
| **Live data** | Fixtures are static; wiring to `GET /v1/notifications` deferred to `shell-web` | — |

---

## Severity table (residual)

| # | Issue | Category | Severity (1–5) | Status |
|---|-------|----------|----------------|--------|
| 1 | Sidebar story ≠ product IA | Navigation | ~~5~~ | **Fixed** (CC-10) |
| 2 | No gate badges in stories | Actionability | ~~5~~ | **Fixed** (CC-10) |
| 3 | Missing Sessions section | Navigation | ~~5~~ | **Fixed** (CC-10) |
| 4 | No badge/status vocabulary | Signaling | ~~4~~ | **Fixed** (CC-10) |
| 5 | Only one snapshot / no empty variant | Coverage | ~~4~~ | **Fixed** (CC-10) |
| 6 | Generic Home/Flows labels | Mental model | ~~3~~ | **Retired** (CC-10) |
| 7 | Settings footer without product mapping | IA | ~~2~~ | **Retired** (CC-10) |
| 8 | Needs you in header strip | Actionability | 3 | Open — shell-web chrome |
| 9 | Hidden-space label fixture | IA | 2 | Open — future story |

**Overall assessment:** Sidebar stories are now credible Murrmure operator navigation fixtures. Residual gaps are composite header chrome and edge-case coverage, not primitive IA misalignment.
