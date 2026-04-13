# Euclid — Learning Platform

## What this is

A mathematics learning platform designed to fill the gap between sites like Khan Academy (low skill ceiling) and raw textbooks (no interactivity). The core thesis: research-backed pedagogy (SRS, spaced repetition, self-rating) with a high skill ceiling, sourced from open textbooks (OpenStax), built around a visual knowledge map of all of mathematics.

---

## Current state of the codebase

The project is a set of standalone HTML files. There is no build system, no framework, no backend — everything is vanilla HTML/CSS/JS. Files are large single-page apps.

### Files in project

| File | Description |
|------|-------------|
| `euclid_platform.html` | **Main file** — the integrated platform shell with view router |
| `euclid_integrated.html` | Knowledge map with mastery system (base for platform) |
| `knowledge_map_with_mastery.html` | Earlier iteration of map (superseded) |
| `lesson_2_1.html` | OpenStax Elementary Algebra 2e, Section 2.1 |
| `admin_validation.html` | Author tool for validating/completing problem sets |

> **Important:** `euclid_platform.html` is the canonical working file. It embeds `lesson_2_1.html` and `admin_validation.html` as blob URL iframes inside the shell. Always work from `euclid_platform.html` for platform-level changes.

---

## Architecture

### Shell (`euclid_platform.html`)

A full-viewport shell with:
- **Topbar** — Euclid logo, nav tabs (Learn / Map / Review / Admin), streak badge, XP pill, avatar
- **View router** — `switchView(view)` switches between four panels via `display:flex` / `display:none`
- **`window.euclidMap` public API** — exposes `setMastery(id, val)`, `getMastery(id)`, `showToast(title, sub)` for cross-iframe communication

### View panels

```
.view-panel#view-learn   → <iframe id="learnFrame">  (lesson_2_1.html, lazy blob URL)
.view-panel#view-map     → canvas-based knowledge map (active by default)
.view-panel#view-admin   → <iframe id="adminFrame">  (admin_validation.html, lazy blob URL)
.view-panel#view-review  → placeholder (SRS queue, not yet built)
```

Iframes are lazy-loaded on first tab click using `URL.createObjectURL(new Blob([html], {type:'text/html'}))`. This gives full CSS/JS isolation — the lesson's `const DATA = {...}` and the map's `const domains = [...]` never collide.

### Knowledge map engine

The map lives inside `#view-map` in the shell. Key architecture:

- **9 domains** arranged radially (Arithmetic, Algebra, Analysis, Geometry & Topology, Number Theory, Discrete Math, Probability & Statistics, Foundations & Logic, Applied Math)
- **~160 nodes** total, each with: `id`, `label`, `depth (1–6)`, `msc` (Math Subject Classification), `desc`, world coordinates `(wx, wy)`
- **Depth scale**: 1 = primary, 2 = secondary, 3 = early undergrad, 4 = late undergrad, 5 = graduate, 6 = research frontier
- **Blob rendering** — organic domain blobs using sine-perturbed ellipses on `<canvas>`
- **Mastery Map** — `Map<nodeId, 0–100>` drives node fill (solid teal ≥80%, pie-slice arc for partial, dim for 0%)
- **Pathfinding state**: `selected`, `hovered`, `criticalPath[]`, `hoverPathNodes`, `hoverPathEdgeKeys`
- **`nodeMap`** — `Map<id, node>` for O(1) lookup; each node has `.prereqs[]` and `.dependents[]` arrays built at init
- **`computeCriticalPath(node)`** — walks back through deepest prereqs to root
- **`bfsPath(start, end)`** — BFS through dependents to find hover path between two nodes
- **Depth filter toggles** — bottom-right UI, filters nodes by depth level
- **Side panel** — slides in on node click, shows mastery ring, critical path (clickable), prereqs, dependents

### Mastery bridge

The lesson iframe communicates back to the map via:
```js
// Inside lesson_2_1.html
if (window.parent && window.parent.euclidMap) {
  window.parent.euclidMap.setMastery('m82463', pct);
}
```

`m82463` is the OpenStax topic ID for Section 2.1 (maps to `alg1` node conceptually — **this mapping is currently hardcoded and needs to be formalised**).

### Lesson structure (`lesson_2_1.html`)

- **`DATA` object** — large inline JSON with `blocks[]` (lesson content) and `problems[]` (76 practice problems)
- **Block types**: `section_heading`, `text`, `note`, `worked_example`, `concept_check`, `figure`
- **Problem fields**: `id`, `topic_id`, `statement` (MathML), `answer`, `answer_type`, `difficulty (1–3)`, `group_label`, `no_solution_provided`
- **State**: `attempted`, `correct`, `selfRated`, `solutionsViewed` (all Sets/Maps)
- **Self-rating**: Easy / Got it / Struggled / Blanked — feeds into SRS scheduling (not yet wired to backend)
- **Mastery formula**: `correct / total * 100` — simple for now
- Problems with `no_solution_provided: true` have no answer key (OpenStax odd/even split)

### Admin tool (`admin_validation.html`)

- Queue of problems needing review, filterable by `no_sol` / `pending` / `done`
- Editor: edit statement (live MathML preview), add answer, set difficulty, build solution steps + hints
- Approve → marks validated, advances to next; Skip; Delete
- Add new problem modal (manually authored)
- Export to JSON — downloads validated problem bank
- **No persistence** — all in-memory; export is the save mechanism

---

## Design system

All files share the same CSS variables and visual language:

```css
--bg: #0e0f0e        /* near-black background */
--bg2: #161714       /* card surfaces */
--bg3: #1d1e1b       /* input backgrounds */
--bg4: #252621       /* inactive elements */
--teal: #1D9E75      /* primary action, mastered nodes */
--teal2: #9FE1CB     /* teal text on dark */
--amber: #EF9F27     /* streaks, warnings, admin */
--purple: #7F77DD    /* exercises, in-progress */
--mono: 'DM Mono'
--serif: 'Fraunces'  /* headings, logo */
--sans: 'DM Sans'    /* body */
```

Depth colours (used for node stroke and filter dots):
```js
['', '#EF9F27', '#639922', '#185FA5', '#534AB7', '#7F77DD', '#E24B4A']
//    d1=amber  d2=green   d3=blue    d4=purple  d5=violet  d6=red
```

---

## Key decisions made

1. **No locking** — prerequisites are informational, never gates. A student can start Abstract Algebra without completing Algebra I. The map shows what they're missing as context, not obstruction.

2. **Mastery over boolean** — nodes carry a 0–100 mastery score (fed by lesson performance) rather than a learned/not-learned toggle. Pie-slice arc fill encodes partial mastery visually in the node itself.

3. **Iframe isolation for lesson + admin** — rather than merging all CSS/JS into one file, each major view is a self-contained HTML page loaded as a blob URL iframe. This avoids variable collisions and makes each page independently testable.

4. **OpenStax as content source** — Elementary Algebra 2e (and future textbooks) provide structured problem sets. Problems missing answers (OpenStax publishes odd-numbered answers only) go into the admin validation queue.

5. **SRS self-rating** — Easy / Got it / Struggled / Blanked rating after each problem is the primary input to spaced repetition scheduling. Modelled loosely on Anki's SM-2 algorithm. Not yet wired to a scheduler.

6. **MSC classification** — every map node has a Math Subject Classification code (`msc` field). This is groundwork for eventually linking nodes to textbook sections and external resources by MSC.

7. **Blob URL lazy loading** — Learn and Admin tabs are not loaded until first clicked, keeping initial parse time low. The shell stays fast.

---

## Upcoming tasks (priority order)

### 1. Node–lesson mapping
The current `setMastery('m82463', pct)` call in the lesson is hardcoded to an OpenStax topic ID. Need a proper mapping table: `topic_id → map node id(s)`. A lesson may map to multiple nodes (e.g. a section on linear equations maps to both `alg1` and a more specific node). Define this as a JSON config or a field on the `DATA` object.

### 2. Lesson navigation from map
When a user clicks a node in the map and hits "Go to lesson →", it should actually navigate to the relevant lesson, not just close the panel. Need:
- A `lessons` registry mapping node IDs to lesson files/URLs
- `switchView('learn')` + load the correct lesson into the iframe
- Breadcrumb in the lesson sidebar ("← Back to map") that calls `switchView('map')`

### 3. SRS scheduler
Self-rating data (Easy/Got it/Struggled/Blanked) is collected but not used. Need:
- SM-2 or similar algorithm: rating → next review interval
- Per-problem interval + ease factor storage (localStorage for now)
- Review queue that surfaces due items in the Review tab
- Map mastery decay: nodes whose reviews are overdue should dim slightly

### 4. More lesson content
Only Section 2.1 exists. Need a pipeline to convert more OpenStax sections into the `DATA` format:
- The admin tool already handles problems with missing answers
- Worked example steps are mostly empty (parser couldn't extract them from the XML) — need manual completion via admin tool or a better parser
- Target: all of Chapter 2 (Solving Linear Equations) to start

### 5. Proof verifier (separate chat)
A structured proof editor where students can write logical steps and have them verified. Discussed but explicitly deferred to a separate development thread.

### 6. Persistence
Currently everything is in-memory:
- Mastery scores reset on reload
- Self-ratings are lost
- Admin validations require manual JSON export
Replace with localStorage (short-term) or a proper backend (long-term). The `window.euclidMap.setMastery()` API is the right hook — just needs persistence behind it.

### 7. MathML rendering quality
MathML renders natively in Firefox but inconsistently in Chrome/Safari. Consider adding MathJax or KaTeX as a fallback renderer for the lesson and admin pages. The map itself uses canvas and doesn't have this issue.

### 8. Mobile / responsive
The shell assumes a desktop viewport. The map canvas works on touch (touch handlers are implemented) but the side panel and lesson sidebar need responsive treatment for smaller screens.

---

## How to work on this

**Adding a new lesson:**
1. Export the lesson DATA JSON (use the parser or build manually)
2. Missing answers → load in `admin.html`, validate, export JSON
3. Add the lesson HTML file alongside the others
4. Add an entry to the lessons registry (once built — see task 2)
5. Map the `topic_id` values in `DATA.problems` to map node IDs

**Changing the knowledge map structure:**
- Domain data is in the `domains[]` array in `euclid_platform.html` (or `euclid_integrated.html`)
- Cross-domain edges are in `crossEdges[]` just below the domain data
- Node positions are polar coordinates `(r, a)` relative to the domain center, converted to world coords at init
- After changing data, `nodeMap`, `prereqs`, and `dependents` are rebuilt automatically at init — no manual wiring needed

**Changing the mastery system:**
- `getMastery(id)` / `setMastery(id, val)` are on `window.euclidMap`
- The `mastery` Map is the single source of truth in the shell
- The lesson calls `setMastery` directly; the map reads it on every `draw()` call
- The demo mastery state (pre-seeded values) is in the `demoMastery` object near the top of the script — remove this when real persistence is added

**Modifying the shell layout:**
- The topbar, view panels, and side panel are in the HTML before `<script>`
- `switchView(view)` is the router — it handles tab highlighting, panel visibility, and lazy iframe loading
- The map resize is triggered on switch back to Map to avoid canvas sizing glitches
