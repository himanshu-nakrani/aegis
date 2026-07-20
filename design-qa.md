# Design QA — Canvas Run Lens

**Target**

- Source visual truth: `/var/folders/6m/fzrk53zx18vd4kk4zj2jn3tw0000gn/T/codex-clipboard-979ae132-834d-4edb-9b11-e5c4ed1b4876.png`
- Implementation route: `http://localhost:3002/workflows/8e02a190-c4e7-4323-9a0f-18b1ad4335de`
- Latest browser-rendered screenshot: `/tmp/aegis-run-lens-final-qa.png`
- Latest viewport and state: 1280 × 720, desktop Run Lens while the launch request is in the safe `Starting` state.
- Reference-aligned composition capture: `/tmp/aegis-run-lens-final.png` at 1487 × 1058.
- Full-view comparison evidence: `/tmp/aegis-run-lens-comparison-final.png` (source and latest implementation side by side), plus `/tmp/aegis-run-lens-comparison-reference-1487.png` for the matched 1487 × 1058 capture.
- Focused deck comparison evidence: `/tmp/aegis-run-lens-comparison-deck.png` (stage strip, live-events, selected-output, trace, and metrics regions side by side).

**Findings**

- No actionable P0–P2 visual differences.
- Expected content differences: the rendered workflow has three real stages rather than the reference’s six, and the browser fixture was still launching rather than showing populated output. The layout preserves the same canvas-first hierarchy, docked execution deck, stage strip, three-column inspection deck, dark graphite token system, compact tool rail, and restrained amber/green runtime accents.
- [P3] The source has a branded mark at the header’s left edge, while the product’s existing application shell supplies its established Aegis wordmark/back affordance. This is intentional product chrome, not a Run Lens fidelity regression.

**Required Fidelity Surfaces**

- **Fonts and typography:** The implementation keeps the existing product’s compact sans hierarchy and monospaced runtime labels. Stage, event, payload, trace, and metric text remain legible at desktop density without wrapping or clipping.
- **Spacing and layout rhythm:** The graph is refit after the dock opens so nodes remain above the deck. The deck follows the source’s execution-strip → three-column detail → compact metric-footer cadence; horizontal overflow is contained in the stage strip and the deck stacks/scrolls at smaller widths.
- **Colors and visual tokens:** The graphite-black background, subtle grid, low-contrast borders, muted neutral text, green success cues, and restrained amber active state follow the reference’s hierarchy without introducing bright card chrome or gradients.
- **Image quality and asset fidelity:** No new raster assets are required by this product surface. Existing application icons are rendered through the project’s icon library; no placeholder, emoji, custom inline SVG, or CSS-drawn asset was introduced.
- **Copy and content:** Runtime labels use the actual graph stage labels and actual run state. Launch uses `Starting` until a fresh server run ID exists, then exposes Stop; this prevents a stale run from being cancelled.

**Interaction and Console Checks**

- Entered a workflow input and started a run: the canvas transitioned to Run Lens, the Compose control was disabled, authoring affordances were removed, and the deck exposed its stage sequence, event feed, selected output, trace, and metrics regions.
- Verified the new launch guard visually: `Starting workflow run` is disabled until a real run ID is received, so Stop cannot target a previous run or no-op during creation.
- Browser console errors: none.
- The isolated local runtime fixture did not return a run ID during this final visual check, so populated node-event content was not re-created from that fixture. Structural populated-output fidelity was compared using the reference-aligned 1487 × 1058 capture above; no visual code changed between that capture and the final launch-state guard.

**Comparison History**

1. Initial exact-viewport comparison found the canvas needed a persistent runtime deck and a graph reframe above it. The Run Lens, rail, anchored result treatment, stage ordering, and responsive deck were implemented.
2. Source review found runtime-state hazards (authoring while a run was pending, stream recovery, and stale Stop targeting). These were fixed with read-only run mode, authoritative stream reconciliation, and a disabled launch state.
3. Final full-view and deck-region comparisons found no remaining P0–P2 visual mismatches. The source and rendered implementation were opened together for both comparisons.

**Implementation Checklist**

- [x] Docked Run Lens with execution strip, events, selected output, trace, and metrics.
- [x] Run-mode-only read-only interaction model with selection preserved.
- [x] Responsive deck behavior and graph reframe.
- [x] Interrupted-stream reconciliation and safe launch/stop handling.
- [x] Typecheck, lint, diff hygiene, browser console, and visual comparison completed.

**Follow-up Polish**

- If a demo workflow with deterministic node output is available, capture its completed-result state to replace the fixture’s empty launch payload in future visual examples.

final result: passed
