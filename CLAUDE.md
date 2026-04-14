# Euclid — Learning Platform

A mathematics learning platform designed to fill the gap between Khan Academy (low skill ceiling) and raw textbooks (no interactivity). Research-backed pedagogy (SRS, spaced repetition, self-rating) with a high skill ceiling, sourced from OpenStax, built around a visual knowledge map of all of mathematics.

---

## Files

| File | Description |
|------|-------------|
| `platform.html` | **Main file** — shell, view router, map canvas |
| `js/map-data.js` | Domain/node/edge data + demo mastery seed |
| `js/map-engine.js` | Map rendering, interaction, side panel, public API |
| `lesson-2-1.html` | OpenStax Elementary Algebra 2e, Section 2.1 |
| `admin.html` | Author tool for validating/completing problem sets |

`platform.html` is the canonical entry point. It loads `lesson-2-1.html` and `admin.html` into iframes on first tab click.

---

## Architecture

### Shell (`platform.html`)

- **Topbar** — logo, nav tabs (Learn / Map / Review / Admin), streak, XP, avatar
- **View router** — `switchView(view)` toggles four panels via `.active` class
- **`window.euclidMap`** — public API: `setMastery(id, val)`, `getMastery(id)`, `showToast(title, sub)`

Panels:
```
#view-learn   → <iframe id="learnFrame">  (lesson-2-1.html, lazy src)
#view-map     → canvas map (active by default)
#view-admin   → <iframe id="adminFrame">  (admin.html, lazy src)
#view-review  → placeholder
```

Iframes are lazy-loaded on first tab click (`frame.src = 'file.html'`). The side panel (`#panel`) slides in from the right when a map node is selected.

### Map (`js/map-data.js` + `js/map-engine.js`)

**Data** (`map-data.js`):
- `domains[]` — 9 domains with `id`, `label`, `cx/cy`, `rx/ry`, `col`, `nodes[]`, `edges[]`
- `crossEdges[]` — edges between domains
- `demoMastery` — seed values (remove when real persistence is added)
- Each node: `id`, `label`, `r` (radius), `a` (angle°), `d` (depth 1–6), `msc`, `desc`

**Engine** (`map-engine.js`):
- Builds `allNodes`, `allEdges`, `nodeMap` from the data at init
- `mastery` Map (0–100 per node) drives node fill; `window.euclidMap.setMastery()` is the write path
- `computeCriticalPath(node)` — walks prereqs to root picking deepest at each step
- `bfsPath(start, end)` — BFS through dependents for hover path highlighting
- `openPanel(nd)` / `closePanel()` — side panel with mastery ring, critical path, prereqs, dependents
- Depth filter toggles (bottom-right), pan/zoom, touch support

**Depth scale**: 1 = primary · 2 = secondary · 3 = early undergrad · 4 = late undergrad · 5 = graduate · 6 = research

### Lesson (`lesson-2-1.html`)

- `DATA` object with `blocks[]` (content) and `problems[]` (76 problems)
- Block types: `section_heading`, `text`, `note`, `worked_example`, `concept_check`, `figure`
- Self-rating per problem: Easy / Got it / Struggled / Blanked
- Mastery bridge: `window.parent.euclidMap.setMastery('alg1', pct)` — currently hardcoded, needs a proper `topic_id → node id` mapping table

### Admin (`admin.html`)

- Problem queue filterable by `no_sol` / `pending` / `done`
- Edit statement (live MathML preview), add answer, set difficulty, build solution steps + hints
- Export to JSON — no persistence, export is the save mechanism

---

## Design system

```css
--bg: #0e0f0e      --teal: #1D9E75     --mono: 'DM Mono'
--bg2: #161714     --teal2: #9FE1CB    --serif: 'Fraunces'
--bg3: #1d1e1b     --amber: #EF9F27    --sans: 'DM Sans'
--bg4: #252621     --purple: #7F77DD
```

Depth colours: `['','#EF9F27','#639922','#185FA5','#534AB7','#7F77DD','#E24B4A']` (d1–d6)

---

## Key decisions

- **No locking** — prerequisites are informational, never gates
- **Mastery 0–100** — pie-slice arc fill for partial mastery, solid teal ≥80%
- **Iframe isolation** — lesson and admin are independent HTML files loaded by iframe
- **OpenStax content** — problems missing answers go into the admin validation queue
- **SRS self-rating** — Easy/Got it/Struggled/Blanked collected but not yet wired to a scheduler

---

## Upcoming tasks (priority order)

1. **Node–lesson mapping** — replace hardcoded `setMastery('alg1', pct)` with a `topic_id → node id[]` config
2. **Lesson navigation from map** — "Go to lesson →" should load the right lesson; needs a `lessons` registry keyed by node id
3. **SRS scheduler** — SM-2 algorithm on self-rating data; per-problem interval + ease factor in localStorage; Review tab queue; mastery decay
4. **More lesson content** — pipeline to convert OpenStax sections into `DATA` format; target: all of Chapter 2
5. **Persistence** — localStorage behind `window.euclidMap.setMastery()`; remove `demoMastery` seed
6. **MathML rendering** — native in Firefox, inconsistent elsewhere; consider MathJax/KaTeX fallback
7. **Mobile/responsive** — shell assumes desktop; side panel and lesson sidebar need treatment

---

## How to work on this

**Adding a new lesson:**
1. Build the lesson `DATA` JSON (parser or manual)
2. Missing answers → load in `admin.html`, validate, export JSON
3. Add the lesson HTML file
4. Register it in the lessons registry (task 2 above)
5. Map `topic_id` values to node ids

**Changing the map structure:**
- Edit `js/map-data.js` — `domains[]` for nodes/intra-domain edges, `crossEdges[]` for cross-domain edges
- Node positions are polar `(r, a)` relative to domain centre; world coords computed at init
- `nodeMap`, `prereqs`, `dependents` rebuild automatically — no manual wiring needed

**Changing the mastery system:**
- `window.euclidMap.setMastery(id, val)` is the write path; `getMastery(id)` is the read path
- `mastery` Map in `map-engine.js` is the single source of truth
- `demoMastery` in `map-data.js` is the seed — remove it when persistence is added
