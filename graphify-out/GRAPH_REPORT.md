# Graph Report - chass-cheating-detect  (2026-09-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 41 nodes · 61 edges · 9 communities (6 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8

## God Nodes (most connected - your core abstractions)
1. `anchor()` - 5 edges
2. `renderBadges()` - 5 edges
3. `renderIndicator()` - 5 edges
4. `usernameElement()` - 4 edges
5. `_hydrate()` - 4 edges
6. `_internal()` - 4 edges
7. `_public()` - 4 edges
8. `clear()` - 3 edges
9. `isCompact()` - 3 edges
10. `svg()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `_internal()` --calls--> `_hydrate()`  [EXTRACTED]
  src/content/api.js → src/content/api.js  _Bridges community 3 → community 7_
- `_internal()` --calls--> `_normalize()`  [EXTRACTED]
  src/content/api.js → src/content/api.js  _Bridges community 5 → community 7_
- `_public()` --calls--> `_normalizePublic()`  [EXTRACTED]
  src/content/api.js → src/content/api.js  _Bridges community 5 → community 8_
- `playerGames()` --calls--> `_public()`  [EXTRACTED]
  src/content/api.js → src/content/api.js  _Bridges community 7 → community 8_

## Import Cycles
- None detected.

## Communities (9 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.20
Nodes (9): content_scripts, default_locale, description, host_permissions, manifest_version, name, permissions, version (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.47
Nodes (9): anchor(), clear(), isCompact(), renderBadges(), renderIndicator(), svg(), tooltip(), username() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.83
Nodes (3): badges(), device(), run()

### Community 3 - "Community 3"
Cohesion: 0.83
Nodes (3): _hydrate(), _post(), _resolveUuid()

### Community 4 - "Community 4"
Cohesion: 0.67
Nodes (3): action, default_popup, default_title

### Community 5 - "Community 5"
Cohesion: 0.67
Nodes (3): _normalize(), _normalizePublic(), normalizeTimeClass()

## Knowledge Gaps
- **11 isolated node(s):** `content_scripts`, `default_locale`, `description`, `host_permissions`, `manifest_version` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 12 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `action` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `content_scripts`, `default_locale`, `description` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._