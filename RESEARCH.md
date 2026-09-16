# Источники данных — проверено на живом ответе (16.09.2026)

## Итог

**Одного запроса хватает на всё.** Внутренний эндпоинт chess.com отдаёт и результаты партий,
и точность, и дату регистрации соперника. Публичный `api.chess.com/pub` нужен только как fallback.

```
POST https://www.chess.com/service/player-game-archive-v2/
     chesscom.game_gateway.v2.GameGatewayService/HydrateGamesByCriteria
content-type: application/json
connect-protocol-version: 1        ← chess.com шлёт этот заголовок (Connect RPC)
cookie: <сессия, уходит сама из content script>

{ "username": "НИК", "playerId": "<uuid>",
  "isVsComputer": false, "isVsCoach": false, "page": 1, "pageSize": 50 }
```

Важно: сам chess.com **не шлёт** ни `fieldMask`, ни `timeClasses`, ни обёртку `criteria` —
плоское тело, и в ответ приходит всё. Статус 200, CSRF-заголовков нет.

## Что лежит в ответе (`hydratedGames[]`, 50 партий = 254 КБ)

| Поле | Покрытие | Зачем |
|---|---|---|
| `game.endedAt` (ISO) | 100% | окно 12 часов |
| `game.chessGame.{white,black}Player.result` | 100% | `PLAYER_RESULT_WIN / LOSE / DRAW` → LUCKY, COLD, свой счёт |
| `playerMetadata.*.createdAt` | 100% | **дата регистрации → NEW, без отдельного запроса** |
| `analysisMetadata.*.accuracy` | **43%** за 12ч | HIGH |
| `game.timeClass` | 100% | фильтр по тайм-контролю |
| `.finalRating`, `.ratingDiff` | 100% | рейтинг и его дельта за сессию |
| `playerMetadata.*.membership` | 100% | basic / gold / platinum / diamond |
| `playerMetadata.*.country`, `.timezone`, `.avatar` | 100% | карточка |
| `.client` | 100% | устройство: `Chesscom-iOS/... (iPhone...)` vs `LC6;chrome/153...;Windows 10` |
| `chessGame.moveTimestamps[]` | **100%** | остаток часов после каждого хода |
| `analysisMetadata.*.moveClassificationCountsV2` | ~16% | BRILLIANT и прочие метки ходов |
| `.dwIncidentLogged`, `.badSportBehavior` | 100% | флаги поведения (в выборке почти везде 0 / NONE, `DISCONNECT` один раз) |
| `pagination.nextPageToken` | — | пагинация (страницы также принимаются как `page`) |

## Про accuracy

Она есть **только у разобранных партий**, но, в отличие от публичного API, приходит и для
бесплатных аккаунтов. Реальный замер по архиву соперника (basic, Малайзия, 50 партий за 10 дней):

- всего с accuracy: 8 из 50;
- **за последние 12 часов: 3 из 7 партий**.

Публичный API на том же интервале давал 0. Вывод: HIGH строим на подмножестве разобранных
партий и требуем отдельный минимум (по умолчанию 3), иначе бейдж просто не показываем.

## Что даёт `moveTimestamps` (100% покрытие)

Это остаток времени на часах после каждого хода → восстанавливается время на каждый ход.
У движка распределение времени аномально ровное, у человека — рваное (быстро в дебюте,
долго в критических позициях). Сигнал доступен **для всех партий**, а не для 43%, и не
требует разбора. Кандидат в отдельный бейдж/усиление HIGH.

## Публичный API (fallback)

- `GET api.chess.com/pub/player/{u}` → `joined`, `status`, `country`. CORS `*`, без ключа. ✅
- `GET api.chess.com/pub/player/{u}/games/{YYYY}/{MM}` → W/L/D нормально, accuracy почти нет
  (27/278 и 29/88 за месяц у basic-аккаунтов, 0 за последние 12ч). Размер: 60–215 КБ gzip.

Используем, если внутренний эндпоинт отдаст не-200: бейджи LUCKY/COLD/NEW и свой счёт
продолжат работать, HIGH скроется.

## Открытые вопросы (не блокирующие)

1. Обязателен ли `playerId` — если нет, отпадает скрейп HTML профиля ради uuid.
   Решается в рантайме: сначала пробуем без него, при ошибке — скрейп + кэш.
2. Работает ли эндпоинт без логина (инкогнито). Не критично: во время игры пользователь залогинен.
3. Понимает ли сервер `gameEndTimeFrom/To`. Не шлём: строгий proto3-парсер может отдать 400
   на неизвестное поле. Режем по времени на клиенте.

## Риски

- Эндпоинт недокументирован и уже менялся (chess-com-insights мигрировал на него недавно) →
  адаптер + fallback обязательны.
- Запросы строго последовательно, с кэшем на ник (60 с). Параллельные к публичному API дают 429.
