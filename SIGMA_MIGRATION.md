# Sigma.js Migration

Migration scope: knowledge map only. Shell, lessons, admin untouched.

**Data strategy:**
- Map topology (nodes, edges, domains) → `map-data.json` (static file)
- Mastery scores → `localStorage` (already works, keep it)
- PostgreSQL deferred until real auth + multi-device sync is needed

---

## Phase 0 — Decisions (resolve before writing code)

- [ ] Decide blob rendering fidelity: **simplified circles/ellipses** vs full custom sigma NodeProgram with sine perturbation
- [ ] Confirm Vite scope: **map bundle only** vs full project migration

---

## Phase 1 — Data Export

Convert existing JS arrays to graphology-compatible JSON. One-time script.

- [ ] Write extraction script that reads `euclid_platform.html` and outputs `map-data.json`:
  - `domains[]` → domain metadata array
  - Each domain's `nodes[]` → nodes with precomputed `wx`/`wy` world coords
  - `prereqs[]` per node → edges with `type: "prereq"`
  - `crossEdges[]` → edges with `type: "cross"`
- [ ] Verify output row counts match source (~160 nodes, 9 domains)
- [ ] Place `map-data.json` in `/map/public/` so Vite serves it as static asset

---

## Phase 2 — Build System

- [ ] Initialize Vite project in `/map` subdirectory
- [ ] Install dependencies:
  - `sigma`
  - `graphology`
  - `graphology-types`
- [ ] Configure Vite to output single `map.bundle.js`
- [ ] Verify bundle loads in isolation (blank HTML test page)
- [ ] Update shell: load map bundle iframe (same pattern as lesson + admin iframes)

---

## Phase 3 — Sigma.js Map (core)

### 3.1 Graph initialization

- [ ] Fetch `map-data.json` on map load
- [ ] Build `graphology.Graph` from JSON response
- [ ] Assign node positions from `wx`/`wy` (skip layout algorithm — positions precomputed)
- [ ] Initialize `Sigma` instance with graph
- [ ] Confirm all nodes render at correct positions

### 3.2 Node appearance

- [ ] Map depth → node size (depth 1 = largest, depth 6 = smallest)
- [ ] Map depth → node color using depth color scale:
  ```
  d1 = #EF9F27  d2 = #639922  d3 = #185FA5
  d4 = #534AB7  d5 = #7F77DD  d6 = #E24B4A
  ```
- [ ] Edge appearance: thin, low-opacity lines; prereq vs cross edges differ in style

### 3.3 Mastery visualization (custom node renderer)

Replaces current pie-slice arc drawn on canvas. Mastery values read from `localStorage`.

- [ ] Research sigma.js `NodeProgram` API — understand custom WebGL node renderer
- [ ] Design mastery encoding, pick one:
  - Custom WebGL program (pie-slice arc, matches current design exactly)
  - Layered sigma renderer (node body + mastery ring as separate pass)
  - Node color intensity (simple, loses pie-slice fidelity)
- [ ] Implement chosen approach
- [ ] Test: mastery 0% = dim node, mastery 50% = half arc, mastery ≥80% = solid teal

### 3.4 Domain blobs (background layer)

Sigma renders nodes/edges only — blobs need separate layer.

- [ ] Research sigma.js custom rendering layers (`beforeRender` / `afterRender` hooks or DOM overlay)
- [ ] Implement blob layer: sine-perturbed ellipses per domain on canvas behind sigma canvas
- [ ] Sync blob layer camera transform with sigma camera (zoom + pan must match)
- [ ] Test: pan/zoom keeps blobs aligned with their nodes

---

## Phase 4 — Interaction

### 4.1 Hover behavior

- [ ] Node hover → highlight node + show hover path to selected node
- [ ] Implement BFS path highlight: walk dependents from hovered node to selected
- [ ] Dim all non-path nodes/edges during hover (sigma `reducers` API)

### 4.2 Click / selection

- [ ] Node click → set as `selected`, compute critical path
- [ ] Critical path highlight: nodes + edges on path get distinct color/weight
- [ ] Side panel: slides in on click, shows label, depth, mastery ring, prereqs list, dependents list, critical path (clickable)
- [ ] Clicking node in side panel critical path list → select that node on map

### 4.3 Depth filter

- [ ] Rebuild depth filter toggles UI (bottom-right buttons d1–d6)
- [ ] Toggle depth → filter graphology graph → re-render sigma (show/hide nodes by depth)
- [ ] Active filter state preserved across zoom/pan

### 4.4 Camera

- [ ] Zoom in/out (sigma built-in)
- [ ] Pan (sigma built-in)
- [ ] Reset camera button → fit all nodes in view

---

## Phase 5 — Mastery Bridge

- [ ] On map load, read all mastery scores from `localStorage`
- [ ] `window.euclidMap.setMastery(id, val)` → write to `localStorage` + re-render affected node
- [ ] `window.euclidMap.getMastery(id)` → read from `localStorage`
- [ ] Re-render affected node on mastery update without full graph reload
- [ ] Remove `demoMastery` hardcoded seed values from old JS

---

## Phase 6 — Shell Integration

- [ ] Remove old canvas map code from `euclid_platform.html`
- [ ] Point `#view-map` panel to sigma bundle iframe
- [ ] Verify `window.euclidMap` API accessible from lesson iframe across new boundary
- [ ] Verify mastery set in lesson → map node updates without page reload
- [ ] Test all four tabs still work (Learn / Map / Review / Admin)

---

## Phase 7 — Cleanup

- [ ] Remove `euclid_integrated.html` (superseded)
- [ ] Update `CLAUDE.md` architecture section to reflect new stack
- [ ] Confirm no hardcoded `setMastery('alg1', pct)` remnants — replace with proper topic→node mapping

---

## Known hard parts

| Problem | Why hard |
|---|---|
| Custom mastery node renderer | Requires WebGL GLSL shader or sigma's `NodeProgram` API |
| Blob layer camera sync | sigma doesn't expose camera matrix directly — must compute transform manually |
| BFS / critical path in graphology | Reimplement `bfsPath` + `computeCriticalPath` using graphology traversal API |
| Cross-iframe mastery bridge | Map in Vite iframe — `window.parent.euclidMap` postMessage pattern may need adjustment |

---

## Deferred (not part of this migration)

- PostgreSQL — add when real auth + multi-device sync needed
- User accounts / auth
- SRS scheduler
