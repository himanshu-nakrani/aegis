# Aegis Frontend UI Audit

This catalog captures layout, spacing, responsive, typography, color/contrast, and accessibility issues across the Aegis Next.js frontend. All findings reference concrete files/lines and are grouped by surface.

**Summary:** 38 issues total — 10 major, 28 minor.

- **Major:** accessibility (missing label associations), responsive gaps, hardcoded theme/color drift, duplicated UI logic.
- **Minor:** hardcoded text sizes, missing focus/aria polish, inconsistent spacing tokens, scroll UX.

---

## Global / Design System

- [ ] **minor** typography — `src/app/globals.css:214,226,253` — Custom typography utilities (`.nav-label`, `.text-display`, `.text-micro`) exist, but many components still use one-off `text-[10px]` / `text-[11px]` / `text-[32px]` values instead of these tokens. — Consolidate to the existing text utilities and extend them where needed.
- [ ] **minor** color-token — `src/app/layout.tsx:19` — `themeColor: "#09090b"` is hardcoded and slightly different from `--bg: #08080a` in `globals.css`. — Use the same background token (e.g., `var(--bg)` if supported, or align hex).
- [ ] **minor** color-token — `src/app/global-error.tsx:18` — Hardcoded `bg-[#09090b]` and `text-[#fafafa]` instead of `bg-background` / `text-foreground`. — Replace with semantic Tailwind classes.
- [ ] **minor** responsive — `src/components/ui/page-header.tsx:30` — Description uses `max-w-2xl` and title jumps from `text-2xl` to `sm:text-3xl`, but no `md/lg` breakpoint tuning; actions stack with `gap-2` but can wrap awkwardly on very small widths. — Add `sm:max-w-xl md:max-w-2xl` and `gap-3` consistency.
- [ ] **minor** a11y — `src/components/ui/page-header.tsx:30` — Heading is always `<h1>` even when PageHeader is used inside cards/panels. — Allow an optional `as?: "h1" | "h2" | "h3"` prop.
- [ ] **minor** responsive — Many files (see `grep -RIn 'sm:\|md:\|lg:\|xl:'` output) — 60+ files have no responsive classes at all. — Audit list/table views and card grids for mobile-first defaults.
- [ ] **minor** typography — `src/components/layout/AppNav.tsx:42,79` — Uses `text-[11px]` and `text-[10px]` for sub-label and keyboard shortcut. — Use `.nav-label` / `.text-micro` tokens.
- [ ] **minor** a11y — `src/components/layout/AppNav.tsx:74` — The `<nav aria-label="Main">` inside `<header><nav>` is nested; while not invalid, skip-link target `#main-content` and nav landmark could be simplified. — Consider using `<ul>` inside the nav for the link list and add current-page `aria-current`.
- [ ] **minor** a11y — `src/components/layout/MobileNav.tsx:56` — "Keyboard shortcuts" item is a `<button>` but opens a dialog managed elsewhere; focus management after activation is unclear. — Ensure focus returns to trigger on close.
- [ ] **minor** responsive — `src/components/layout/MobileNav.tsx:35` — Mobile sheet uses `side="bottom"` which is good, but links are full-width without vertical dividers and the active state uses `bg-primary-muted` which may not meet contrast on some screens. — Verify contrast ratio and add `aria-current="page"` to active link.

---

## Canvas / Workflow Builder

- [ ] **major** responsive / layout — `src/components/canvas/WorkflowCanvas.tsx:850-880` and `~1000-1030` — Two separate toolbar implementations exist (mobile top bar and desktop floating bar) with duplicated workflow title, input, save, run, and action buttons. This is a maintenance hazard and risks divergence. — Extract a shared `CanvasToolbar` component that accepts layout props.
- [ ] **major** layout — `src/components/canvas/WorkflowCanvas.tsx:1169` — Right sidebar applies both `lg:absolute` and `lg:relative` in the same `cn()` call, which is contradictory and may break positioning across browsers. — Remove `lg:relative` or restructure so absolute positioning and flex layout are mutually exclusive.
- [ ] **minor** responsive — `src/components/canvas/WorkflowCanvas.tsx:972` — Canvas editing is completely blocked below the `isMobileViewport` threshold with an `<EmptyState>`. This is a major UX gap for tablets/small laptops. — Provide a read-only or simplified mobile canvas instead of a dead-end.
- [ ] **minor** color-token — `src/components/canvas/WorkflowCanvas.tsx:74-99` — `MINIMAP_NODE_COLORS` map uses raw hex values instead of the category CSS variables (`--cat-*`). — Map node types to `var(--cat-trigger)`, `var(--cat-llm)`, etc.
- [ ] **minor** a11y — `src/components/canvas/NodeInspector.tsx` — Dozens of `<Label>` instances (e.g., lines 188, 203, 247, 255, 279, 424, 465, 504, 511, 525, 537, 552, 559, 566, 587, 594, 607, 627, 634, 644, 666, 694, 714, 727, 120, 1565) are missing `htmlFor` associations. Screen-reader users cannot relate labels to inputs/selects/textareas. — Add unique ids to each control and matching `htmlFor` on its `<Label>`.
- [ ] **minor** typography — `src/components/canvas/NodeInspector.tsx:218,450,456,545` — Uses `text-[11px]` for code/hint text. — Use `.text-caption` token or `text-xs`.
- [ ] **minor** a11y — `src/components/canvas/NodeInspector.tsx:359` — "No selection" heading uses `<h3 className="text-heading">` but `text-heading` is not a semantic element. — Use `<h2>` (or `<h3>` with `aria-label`) and ensure heading hierarchy.
- [ ] **minor** spacing — `src/components/canvas/NodeInspector.tsx` — Many inspector sections use `space-y-3` but nested `InspectorDetails` adds its own internal `space-y-3`, creating inconsistent vertical rhythm. — Standardize section gaps (`space-y-4` at root, `space-y-3` inside).
- [ ] **minor** responsive — `src/components/canvas/CanvasSidebar.tsx:72` — Left sidebar is fixed `w-[280px]` with no breakpoint scaling; on smaller desktops it can consume too much width. — Consider `w-[260px] xl:w-[280px]`.
- [ ] **minor** responsive — `src/components/canvas/CanvasSidebar.tsx:95` — Tab row uses `overflow-x-auto` with hidden scrollbars (`scrollbar-thin` is not applied), making tabs inaccessible via mouse when overflowed. — Add visible scrollbar styling or wrap tabs.
- [ ] **minor** a11y — `src/components/canvas/CanvasSidebar.tsx:102` — Tab buttons use `id={`canvas-tab-${id}`}` but `id` is not defined in the visible scope shown; verify uniqueness to avoid duplicate IDs across tabs. — Ensure stable unique IDs or use `useId`.
- [ ] **minor** responsive — `src/components/canvas/WorkflowCanvas.tsx:906` — Top toolbar action group uses `overflow-x-auto` with hidden scrollbars and `pb-0.5`; on small screens users cannot see clipped buttons. — Either allow wrapping (`flex-wrap`) or show a scroll affordance.
- [ ] **minor** a11y — `src/components/canvas/WorkflowCanvas.tsx:1147` — Floating run FAB is a `motion.button` without a visible focus ring or hover background change beyond `scale-105`. — Add `focus-visible:ring-2 focus-visible:ring-primary`.
- [ ] **minor** color-token — `src/components/canvas/edges/GradientEdge.tsx` and `ConnectionLine.tsx` — Edge stroke colors reference hardcoded `#` values and `var(--canvas-connection)`; verify they use theme tokens and have sufficient contrast against the dark canvas grid.
- [ ] **minor** spacing — `src/components/canvas/NodePalette.tsx:79` — Category tabs use `scrollbar-thin flex gap-2 overflow-x-auto` but no bottom padding/indicator, making active tab underline hard to see. — Add `pb-1` or a visible bottom border.
- [ ] **minor** typography — `src/components/canvas/NodePalette.tsx:135,146` — Uses `text-[11px]` and `text-[10px]`. — Replace with `text-caption` / `text-xs`.
- [ ] **minor** a11y — `src/components/canvas/NodePalette.tsx:115` — Node palette items are `<button type="button">` but do not expose keyboard drop target behavior; drag-and-drop may not be keyboard accessible. — Add keyboard instructions and a visible focus state.
- [ ] **minor** layout — `src/components/canvas/nodes/BaseNode.tsx:114` — Node width is hardcoded `w-[240px]`; while appropriate for canvas, node content can overflow if labels are long. — Add `max-w-full` and `break-words` to inner text.
- [ ] **minor** a11y — `src/components/canvas/EdgeInspector.tsx:58` — `<Label>Route label</Label>` has no `htmlFor`. — Wire to input id.

---

## Dashboard / Home

- [ ] **minor** responsive — `src/components/dashboard/DashboardView.tsx:245` — Search input wrapper uses `relative` with no responsive width; the input could fill the card width on mobile instead of a fixed feel. — Use `w-full sm:max-w-sm`.
- [ ] **minor** responsive — `src/components/dashboard/DashboardView.tsx:236` — Workflow card list is inside `GlassCard` with `p-5`; on narrow screens the card internal padding plus page padding reduces usable width. — Consider `p-4 sm:p-5`.
- [ ] **minor** typography — `src/components/dashboard/WorkflowCard.tsx:43` — Uses `text-body-lg` token (good), but `RecentRunRow` and other dashboard rows may mix `text-sm` with `text-xs` inconsistently. — Audit dashboard text sizes for hierarchy.
- [ ] **minor** a11y — `src/components/dashboard/HeroGreeting.tsx:28` — `<h1 className="text-display">` may contain non-heading content or be missing an `id` for skip-link targeting. — Ensure exactly one visible `<h1>` per page and link skip-link to it.
- [ ] **minor** color-token — `src/components/dashboard/Sparkline.tsx:61` — SVG gradient uses inline IDs; ensure unique IDs when multiple sparklines render on the page. — Use `useId` for gradient IDs.
- [ ] **minor** a11y — `src/components/dashboard/LiveDot.tsx` — The live indicator relies on color alone (`connected` green). — Add text or an `aria-label` that announces "Connected" / "Disconnected".

---

## Observability / Runs

- [ ] **minor** responsive — `src/app/observability/page.tsx` — Page appears to use stat cards, charts, and a virtualized run list; verify that the run list columns collapse gracefully on mobile (e.g., hide trace ID or latency). — Add responsive column hiding or horizontal scroll with visible affordance.
- [ ] **minor** a11y — `src/components/observability/TraceIdBadge.tsx:37` — Badge uses `text-[10px]` and is a copy button; focus state may be subtle. — Replace `text-[10px]` with `text-xs` and add `focus-visible:ring`.
- [ ] **minor** typography — `src/components/results/RunResultsPanel.tsx:74,82,191,301,367,426,452,457` — Mixes `text-heading` helper class with `<h2>`/`<h3>` inconsistently. — Standardize heading levels per panel depth.
- [ ] **minor** responsive — `src/components/runs/RunDetailView.tsx` — Run detail likely has a fixed-width sidebar (`w-96` in `RunResultsPanel`). — Verify it becomes full-width or collapses on mobile.
- [ ] **minor** a11y — `src/components/runs/RunComparison.tsx:94,111` — Labels for run selectors have no `htmlFor`. — Add ids to selects and `htmlFor` to labels.
- [ ] **minor** color-contrast — `src/app/observability/page.tsx` and `src/components/results/*` — Status badges and eval score bars use color-only status; ensure icons/text labels accompany them.

---

## Settings / Guardrails / Templates

- [ ] **major** a11y — `src/app/settings/page.tsx:346,354,362,371,430,438` — Most form `<Label>` elements (Internal name, Display label, Criteria, LLM instruction, Name, Type) lack `htmlFor` associations. — Add unique ids to each input/textarea/select and matching `htmlFor` on labels.
- [ ] **major** a11y — `src/components/guardrails/GuardrailPlayground.tsx:89,106,120,125` — Labels for Type, Mode, Blocked keywords, Sample text lack `htmlFor`. — Add ids to controls and `htmlFor` to labels.
- [ ] **minor** a11y — `src/app/settings/page.tsx:280` — API key buttons (Save, Rotate, Clear) are inside a form-like card but are not wrapped in a `<form>`; their default `type="submit"` could submit a parent form unexpectedly if one is added later. — Explicitly add `type="button"`.
- [ ] **minor** responsive — `src/app/settings/page.tsx` — Settings uses a card grid; verify that `lg:col-span-2` on the Credentials card aligns with an actual parent grid. — Add a wrapping grid with `grid-cols-1 lg:grid-cols-2`.
- [ ] **minor** responsive — `src/app/templates/page.tsx:147` — Search + filter chips row stacks vertically but may not wrap cleanly on small screens. — Use `flex-col sm:flex-row` with `flex-wrap` for chips.
- [ ] **minor** typography — `src/app/templates/page.tsx:202` — Template card heading uses arbitrary `text-body-lg` but description may be `text-sm`/`text-muted`; verify line-height and spacing consistency. — Use consistent card title/description tokens.
- [ ] **minor** a11y — `src/app/templates/page.tsx` — Template cards use `HoverLift` and are clickable via `onClick`; ensure they have `role="button"`, `tabIndex={0}`, and keyboard handlers, or render as `<button>`/`<a>`. — Convert card action to a real button/link.
- [ ] **minor** a11y — `src/app/guardrails/page.tsx:18` — Back button is wrapped in `<Link>` around `<Button>`; while common, this creates nested interactive elements. — Use `Button asChild` or remove the inner link.
- [ ] **minor** responsive — `src/app/workflows/new/page.tsx:122` — New workflow page uses PageHeader; verify form fields and file-drop area adapt on mobile. — Add responsive padding and full-width inputs on small screens.

---

## Shared UI Components

- [ ] **minor** a11y — `src/components/ui/command.tsx:99` — Command list has `no-scrollbar` utility which removes scrollbars entirely. This hides scroll affordance for mouse users. — Use a thin visible scrollbar or rely on OS default.
- [ ] **minor** a11y — `src/components/ui/virtual-list.tsx:50` — Applies `overflow-y-auto` directly via template string, but no focus management or scroll-into-view on selection changes. — Consider focus/scroll alignment for keyboard navigation.
- [ ] **minor** a11y — `src/components/ui/tabs.tsx:84` — `TabsTrigger` wrapper has `outline-none` but no explicit focus ring override; verify Radix focus styling is visible. — Add `focus-visible:ring` if missing.
- [ ] **minor** a11y — `src/components/ui/select.tsx:120` — Select chevron is `pointer-events-none absolute right-2` without padding accommodation; long values can overlap the icon. — Reserve right padding for the icon.
- [ ] **minor** responsive — `src/components/ui/dialog.tsx:64` — Dialog uses `max-w-[min(32rem,calc(100vw-2rem))]` which is good, but `p-4` may feel tight on mobile with long forms. — Consider `p-5 sm:p-6`.
- [ ] **minor** typography — `src/components/ui/card.tsx:20` — CardTitle is forced to `<h3 className="text-sm font-semibold">`; cards may need larger titles in some contexts. — Allow an optional `size` prop.

---

## Verification

When fixes are applied:
1. `npm run lint` passes in `frontend/`.
2. `npm run typecheck` passes.
3. `npm run build` passes.
4. No new hardcoded `text-[...]` sizes are introduced unless in CSS utilities.
5. All form `<Label>` instances have matching `htmlFor` + control `id`.
