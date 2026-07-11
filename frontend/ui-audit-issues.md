# Aegis Frontend UI/UX Audit — 2026-07-11

Empirical audit: every page driven in Chrome (desktop 1440px + mobile 390px),
axe-core 4.10 scans, 10-stop keyboard probes per page, API-down / overflow /
empty-state testing. Supersedes the previous static audit — most of its majors
were resolved by the redesign; its NodeInspector label finding was confirmed
live and is now fixed.

## Fixed in this audit pass

| Sev | Finding | Fix |
|---|---|---|
| critical (axe) | Settings: 2 unnamed buttons (alert metric/operator SelectTriggers) | `aria-label` on both |
| critical (axe) | Canvas: close button inside `role="tablist"` violates aria-required-children | X moved outside the tablist |
| serious (axe) | `--fg-subtle` (#6f6c62) ≈3.5:1 contrast on elevated surfaces (canvas "Input" label etc.) | token raised to #8b8779 (≥4.5:1) |
| major (a11y) | **41 `<Label>`s in NodeInspector without `htmlFor`** — screen readers couldn't associate inspector fields | all 41 associated with generated control ids |
| moderate (axe) | Landmark violation on every page: CommandDialog rendered its sr-only header outside `<main>`/dialog | header moved inside DialogContent |
| moderate (axe) | Templates: heading order jumped h1→h3 | card titles → h2 |
| minor (a11y) | Missing visible focus ring: failure-cluster links, guardrail preset buttons, run feedback thumbs, canvas back links, panel close X | `.focus-ring` applied |
| minor (UX) | API-down: home/canvas sat in loading skeletons ~15s (React Query 3-retry default) before the error state | `retry: 1` on list + canvas queries |
| minor (copy) | Stale post-IA labels: "Dashboard"/"Back to dashboard" in 9 places (dashboard no longer exists) | renamed to Workflows |

Post-fix axe status: home / settings / templates / canvas (inspector open) —
**0 violations** (Next.js dev-overlay portal excluded).

## Verified healthy (no action needed)

- **States**: API-down shows retryable `ApiConnectionState` everywhere (canvas has
  distinct not-found / auth / network branches); 404 page correct; empty canvas
  shows "Add first step"; empty datasets/experiments/alerts carry guidance copy.
- **Overflow**: 170-char workflow names truncate with ellipsis in home rows and
  the canvas toolbar; long inputs clamp in run rows; unbounded lists were capped
  in the density pass (scheduled workflows, preset library, leaderboard).
- **Mobile (390px)**: nav collapses to a sheet, stat grids stack, run-row meta
  columns hide, canvas shows its intentional larger-screen guard. No horizontal
  scroll on any audited page.
- **Keyboard**: logical tab order on all pages; skip-link present; quick-add menu
  supports ↑/↓/Enter/Esc (Esc closes cleanly); ⌘S/⌘D/Del/⌘K shortcuts work;
  destructive actions gated by confirm dialogs.
- **Consistency**: single type scale (Plex Sans/Mono), category color reserved
  for data semantics, status pills uniform (dot + mono), icon buttons all named,
  RunComparison/Settings/Guardrail form labels already associated.

## Known gaps (accepted / backlog)

- [ ] **minor** Canvas is view-blocked under 768px by design; a read-only mobile
  canvas remains a future option.
- [ ] **minor** Sonner toasts stack bottom-right and can cover the canvas run FAB;
  consider an offset while the inspector is open.
- [ ] **minor** Scattered `text-[10px]`/`text-[11px]` one-offs remain (reduced, not
  eliminated); consolidate into `.text-micro`/`text-xs` opportunistically.
- [ ] **minor** `prefers-reduced-motion` is honored globally, but React Flow's
  fitView pan/zoom animation (300ms) still plays.
- [ ] **info** Home renders all workflows client-side — fine to ~1k rows; virtualize
  beyond that.
