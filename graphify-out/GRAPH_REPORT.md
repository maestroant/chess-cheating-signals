# Graph Report - chass-cheating-detect  (2026-09-16)

## Corpus Check
- 16 files · ~25,074 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: .woff2 2, .css 2, (none) 1)

## Summary
- 85 nodes · 115 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d1b10238`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- manifest.json
- ui.js
- analyze.js
- api.js
- Chess Opponent Insights
- popup.js
- get
- index.js
- Как снять стили подсказки с самой chess.com

## God Nodes (most connected - your core abstractions)
1. `Chess Opponent Insights` - 7 edges
2. `Спецификация (зафиксировано)` - 7 edges
3. `renderBadges()` - 6 edges
4. `renderIndicator()` - 6 edges
5. `render()` - 5 edges
6. `attachTooltip()` - 5 edges
7. `_internal()` - 4 edges
8. `_hydrate()` - 4 edges
9. `_public()` - 4 edges
10. `schedule()` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "manifest.json"
Cohesion: 0.15
Nodes (12): action, default_popup, default_title, content_scripts, default_locale, description, host_permissions, manifest_version (+4 more)

### Community 1 - "ui.js"
Cohesion: 0.20
Nodes (19): attachTooltip(), badgeLines(), _boardTargets(), clear(), ensureFont(), hideTooltip(), isProfilePage(), mount() (+11 more)

### Community 2 - "analyze.js"
Cohesion: 0.83
Nodes (3): badges(), device(), run()

### Community 3 - "api.js"
Cohesion: 0.36
Nodes (10): _hydrate(), _internal(), _monthsBetween(), _normalize(), _normalizePublic(), normalizeTimeClass(), playerGames(), _post() (+2 more)

### Community 4 - "Chess Opponent Insights"
Cohesion: 0.12
Nodes (14): Chess Opponent Insights, Как это работает, Не доделано, Проверено, Разметка chess.com, Структура, Установка для разработки, Бейджи соперника (+6 more)

### Community 5 - "popup.js"
Cohesion: 0.29
Nodes (4): apply(), FLAGS, load(), NUMBERS

### Community 7 - "index.js"
Cohesion: 0.70
Nodes (4): init(), isStale(), schedule(), update()

### Community 8 - "Как снять стили подсказки с самой chess.com"
Cohesion: 0.50
Nodes (3): 1. Токены темы → `devtools/theme-tokens.json`, 2. Настоящая подсказка chess.com → `devtools/native-tooltip.json`, Как снять стили подсказки с самой chess.com

## Knowledge Gaps
- **27 isolated node(s):** `Установка для разработки`, `Структура`, `Как это работает`, `Разметка chess.com`, `Проверено` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 33 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Установка для разработки`, `Структура`, `Как это работает` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chess Opponent Insights` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._