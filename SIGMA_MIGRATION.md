# Sigma.js + PostgreSQL Migration

Migration scope: knowledge map only. Shell, lessons, admin untouched.

---

## Phase 0 — Decisions (resolve before writing code)

- [ ] Pick backend: **Supabase** (recommended — zero infra, auto REST) vs Node/Express vs Next.js
- [ ] Pick user identity strategy: **localStorage UUID** (no auth) vs real auth. Mastery is per-user in DB so this must be decided first.
- [ ] Decide blob rendering fidelity: **simplified circles/ellipses** vs full custom sigma NodeProgram with sine perturbation
- [ ] Confirm Vite scope: **map bundle only** vs full project migration

---

## Phase 1 — Database

### 1.1 Schema

- [ ] Create `domains` table

  ```sql
  id          text primary key,
  name        text,
  cx          float,   -- world x of domain center
  cy          float,   -- world y of domain center
  rx          float,   -- blob x radius
  ry          float,   -- blob y radius
  color       text,    -- hex
  angle_offset float   -- radial position on map
  ```

- [ ] Create `nodes` table

  ```sql
  id          text primary key,
  label       text,
  depth       int,     -- 1–6
  msc         text,
  description text,
  domain_id   text references domains(id),
  wx          float,   -- final world x (precomputed from polar)
  wy          float    -- final world y
  ```

- [ ] Create `edges` table

  ```sql
  source_id   text references nodes(id),
  target_id   text references nodes(id),
  type        text     -- 'prereq' or 'cross'
  ```

- [ ] Create `user_mastery` table

  ```sql
  user_id     text,
  node_id     text references nodes(id),
  score       int,     -- 0–100
  updated_at  timestamptz,
  primary key (user_id, node_id)
  ```

### 1.2 Seed data

- [ ] Write extraction script: parse `domains[]` array from `euclid_platform.html` → domain INSERT statements
- [ ] Write extraction script: parse each domain's `nodes[]` array → node INSERT statements (capture precomputed `wx`/`wy`)
- [ ] Write extraction script: parse `prereqs[]` per node → edge INSERT statements (`type = 'prereq'`)
- [ ] Write extraction script: parse `crossEdges[]` → edge INSERT statements (`type = 'cross'`)
- [ ] Run seed scripts, verify row counts match current JS arrays (~160 nodes, 9 domains)

---

## Phase 2 — API Layer

### 2.1 Endpoints

- [ ] `GET /nodes` — return all nodes with `{ id, label, depth, msc, description, domain_id, wx, wy }`
- [ ] `GET /edges` — return all edges with `{ source_id, target_id, type }`
- [ ] `GET /mastery/:userId` — return `[{ node_id, score }]` for user
- [ ] `POST /mastery` — upsert `{ user_id, node_id, score }`, return updated row

### 2.2 Validation

- [ ] Verify `/nodes` + `/edges` response matches node/edge counts from seed
- [ ] Verify mastery upsert round-trips correctly (write then read)

---

## Phase 3 — Build System

- [ ] Initialize Vite project in `/map` subdirectory (scope: map only, not full project)
- [ ] Install dependencies:
  - `sigma`
  - `graphology`
  - `graphology-types`
- [ ] Configure Vite to output single `map.bundle.js` file
- [ ] Verify bundle loads in isolation (blank HTML test page)
- [ ] Update shell: load map bundle as blob URL iframe (same pattern as lesson + admin)

---

## Phase 4 — Sigma.js Map (core)

### 4.1 Graph initialization

- [ ] Fetch `/nodes` + `/edges` on map load
- [ ] Build `graphology.Graph` from API response
- [ ] Assign node positions from `wx`/`wy` (skip layout algorithm — positions are precomputed)
- [ ] Initialize `Sigma` instance with graph
- [ ] Confirm all nodes render at correct positions

### 4.2 Node appearance

- [ ] Map depth → node size (depth 1 = largest, depth 6 = smallest)
- [ ] Map depth → node color using existing depth color scale:

  ```
  d1 = #EF9F27  d2 = #639922  d3 = #185FA5
  d4 = #534AB7  d5 = #7F77DD  d6 = #E24B4A
  ```

- [ ] Edge appearance: thin, low-opacity lines; prereq vs cross edges can differ in style

### 4.3 Mastery visualization (custom node renderer)

This replaces the current pie-slice arc drawn on canvas.

- [ ] Research sigma.js `NodeProgram` API — understand how to write custom WebGL node renderer
- [ ] Design mastery encoding: options are
  - Custom WebGL program (pie-slice arc, matches current design exactly)
  - Layered sigma renderer (node body + mastery ring as separate pass)
  - Fall back to node color intensity (simple, loses pie-slice fidelity)
- [ ] Implement chosen approach
- [ ] Test: mastery 0% = dim node, mastery 50% = half arc, mastery ≥80% = fully filled teal

### 4.4 Domain blobs (background layer)

Sigma renders nodes/edges only — blobs need a separate layer.

- [ ] Research sigma.js custom rendering layers (`beforeRender` / `afterRender` hooks or a DOM overlay)
- [ ] Implement blob layer: sine-perturbed ellipses per domain drawn on canvas behind sigma canvas
- [ ] Sync blob layer camera transform with sigma camera (zoom + pan must match)
- [ ] Test: pan/zoom keeps blobs aligned with their nodes

---

## Phase 5 — Interaction

### 5.1 Hover behavior

- [ ] Node hover → highlight node + show hover path to selected node (replaces `hoverPathNodes` / `hoverPathEdgeKeys`)
- [ ] Implement BFS path highlight: `bfsPath(hovered, selected)` — walk dependents
- [ ] Dim all non-path nodes/edges during hover (sigma `reducers` API)

### 5.2 Click / selection

- [ ] Node click → set as `selected`, compute critical path (`computeCriticalPath`)
- [ ] Critical path highlight: nodes + edges on path get distinct color/weight
- [ ] Side panel: slides in on click, shows label, depth, mastery ring, prereqs list, dependents list, critical path (clickable)
- [ ] Clicking a node in the side panel's critical path list → select that node on the map

### 5.3 Depth filter

- [ ] Rebuild depth filter toggles UI (currently bottom-right buttons d1–d6)
- [ ] Toggle depth → filter graphology graph → re-render sigma (show/hide nodes by depth)
- [ ] Active filter state preserved across zoom/pan

### 5.4 Camera

- [ ] Zoom in/out (sigma built-in)
- [ ] Pan (sigma built-in)
- [ ] Reset camera button → fit all nodes in view

---

## Phase 6 — Mastery Bridge

- [ ] Replace in-memory `mastery Map` with API calls
- [ ] `window.euclidMap.setMastery(id, val)` → `POST /mastery` with current user_id
- [ ] `window.euclidMap.getMastery(id)` → read from local cache (populated at map load from `GET /mastery/:userId`)
- [ ] On mastery update, re-render affected node without full graph reload
- [ ] Remove `demoMastery` hardcoded seed values

---

## Phase 7 — User Identity

*(depends on Phase 0 decision)*

**If localStorage UUID (no auth):**

- [ ] On first map load, generate UUID, store in `localStorage` as `euclid_user_id`
- [ ] All mastery API calls use this UUID as `user_id`

**If real auth:**

- [ ] Defer until auth system is chosen — keep localStorage UUID in the interim

---

## Phase 8 — Shell Integration

- [ ] Remove old canvas map code from `euclid_platform.html`
- [ ] Point `#view-map` panel to sigma bundle iframe (blob URL)
- [ ] Verify `window.euclidMap` API still accessible from lesson iframe across new boundary
- [ ] Verify mastery set in lesson → map node updates without page reload
- [ ] Test all four tabs still work (Learn / Map / Review / Admin)

---

## Phase 9 — Cleanup

- [ ] Remove `euclid_integrated.html` and `knowledge_map_with_mastery.html` (superseded)
- [ ] Remove `demoMastery` object from shell
- [ ] Update `CLAUDE.md` architecture section to reflect new stack
- [ ] Confirm no hardcoded `setMastery('m82463', pct)` remnants — replace with proper topic→node mapping

---

## Known hard parts (flag early)

| Problem | Why hard |
|---|---|
| Custom mastery node renderer | Requires writing WebGL GLSL shader or using sigma's underdocumented program API |
| Blob layer camera sync | sigma doesn't expose camera matrix directly — need to compute transform manually |
| BFS / critical path in graphology | Need to reimplement current `bfsPath` and `computeCriticalPath` using graphology traversal API |
| Cross-iframe mastery bridge | If map is now a Vite bundle in an iframe, `window.parent.euclidMap` postMessage pattern may need adjustment |
