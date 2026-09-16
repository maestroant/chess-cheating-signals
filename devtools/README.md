# Сбор данных из DevTools — по шагам

> **Статус:** шаг 1 выполнен, данные в `01-request-payload.json` / `02-response.json` / `03-headers.txt`,
> разбор — в `../RESEARCH.md`. Шаг 2 не нужен: accuracy в ответе есть.
> Шаг 4 выполнен: разметка в `dom/board.html`, селекторы внедрены и проверены.
> Осталось: **шаг 5** (языки и страницы) и проверка переворота доски. Шаг 3 не нужен —
> расширение определит необходимость `playerId` само при первом запросе.
>
> ⚠️ В присланном `03-headers.txt` были живые куки сессии, включая `ACCESS_TOKEN` и
> `CHESSCOM_REMEMBERME`. Я их вырезал, остались только имена заголовков.

Цель: подтвердить, что внутренний эндпоинт chess.com отдаёт **accuracy** для обычного
(бесплатного) аккаунта, и что мы можем вызвать его сами. Без этого не работает бейдж HIGH.

Порядок важен: шаги 1–2 смотрят, как это делает сам chess.com; шаг 3 проверяет, что то же самое
получается у нас; шаг 4 — разметка страницы.

> ⚠️ Не сохраняй «Copy as cURL» / «Copy as fetch» и HAR целиком — там твои куки и токены сессии.
> Ниже нигде не нужны значения заголовков, только имена.

---

## Шаг 1. Найти запрос архива партий

1. Залогинься на chess.com.
2. Открой **архив партий соперника**, который играл сегодня:
   `https://www.chess.com/games/archive/НИК_СОПЕРНИКА`
3. F12 → вкладка **Network** → включи **Preserve log** → фильтр **Fetch/XHR**.
4. В поле фильтра набери `Hydrate`.
5. Обнови страницу (F5). Должен появиться запрос `HydrateGamesByCriteria`.
   Если его нет — полистай архив вниз / переключи страницы пагинации, он уйдёт при подгрузке.

**Что сохранить:**

| Откуда | Куда |
|---|---|
| вкладка **Payload** → правый клик → Copy value (или «view source» → выделить всё) | `devtools/01-request-payload.json` |
| вкладка **Response** → правый клик по телу → **Copy response** | `devtools/02-response.json` |
| вкладка **Headers** → блок **Request Headers**: выпиши только **имена** заголовков + значения `content-type` и `accept` | `devtools/03-headers.txt` |
| строка **General**: Request URL, Request Method, Status Code | туда же, в `03-headers.txt` |

Ответ может быть большим — хватит первых 3–5 партий, остальное можно обрезать.

**Зачем это нужно:**
- payload → видно, какие поля chess.com кладёт в `criteria` сам: шлёт ли `playerId`, использует ли
  серверный фильтр по времени (`gameEndTimeFrom/To`), какой `fieldMask`;
- response → точные имена полей (`endedAt`, `result`, `finalRating`, `client`) и **есть ли
  `analysisMetadata.*.accuracy` не `null`** — это главный вопрос;
- headers → нужен ли нам кастомный заголовок (`x-*`, CSRF-токен), чтобы запрос не отдал 403.

## Шаг 2. Если accuracy в ответе пустая

Тогда её считают в другом месте. Открой **свою** сыгранную партию → **Game Review / Анализ**,
в Network найди запрос, в ответе которого есть число точности (поиск по `accuracy` или `caps`).
Сохрани URL + Response в `devtools/04-review-response.json` и отдельно ответь:
- считается ли точность для бесплатного аккаунта **без** ручного нажатия «Game Review»;
- есть ли лимит вида «N разборов в день».

## Шаг 3. Проверить, что запрос работает от нас

Тот же эндпоинт, но вызванный нашим кодом. На любой странице www.chess.com → Console:

```js
const NICK = 'ник_соперника';

// uuid из HTML профиля
const html = await (await fetch(`https://www.chess.com/member/${NICK.toLowerCase()}`)).text();
const m = html.match(/profile-header-container[^>]*data-username="([^"]+)"[^>]*data-user-id="([^"]+)"[^>]*data-user-uuid="([^"]+)"/i);
console.log('identity:', m && m.slice(1));

const call = (body) => fetch('https://www.chess.com/service/player-game-archive-v2/chesscom.game_gateway.v2.GameGatewayService/HydrateGamesByCriteria',
  { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });

const base = { username: m[1], playerId: m[3],
  timeClasses:["TIME_CLASS_BULLET","TIME_CLASS_BLITZ","TIME_CLASS_RAPID"],
  isVsComputer:false, isVsCoach:false, page:1, pageSize:50 };

const r = await call({ criteria: base, fieldMask: "game,analysisMetadata" });
const j = await r.json();
console.log('status', r.status, j);
copy(JSON.stringify(j.hydratedGames.slice(0,5), null, 1));
```

Запиши в `devtools/05-console-test.txt` статусы трёх проверок:

```js
// без playerId — если 200, не нужен скрейп HTML профиля
(await call({criteria:{...base, playerId:undefined}, fieldMask:"game,analysisMetadata"})).status

// серверный фильтр по времени — если 200 и партий стало меньше, экономим трафик
const now = Math.floor(Date.now()/1000);
(await call({criteria:{...base, gameEndTimeFrom: now-43200, gameEndTimeTo: now}, fieldMask:"game,analysisMetadata"})).status

// без логина: повтори весь шаг 3 в окне инкогнито
```

## Шаг 4. Разметка доски (куда вставлять бейджи)

Во время партии или на `https://www.chess.com/game/live/<id>` → Console:

```js
copy(document.querySelector('.board-layout-top')?.outerHTML + '\n\n<!-- BOTTOM -->\n\n' + document.querySelector('.board-layout-bottom')?.outerHTML)
```
→ `devtools/dom/board.html`. Если играешь в компактном режиме доски — повтори и сохрани как
`devtools/dom/board-compact.html`.

## Шаг 5. Мелочи текстом
- твой ник и тип аккаунта (basic / gold / platinum / diamond);
- 2–3 ника соперников, игравших сегодня;
- URL-шаблоны, где нужны бейджи (минимум `/play/online*` и `/game/live/*`; нужны ли `/member/*`, лобби, турниры?);
- какие тайм-контроли учитывать по умолчанию;
- список локалей для i18n.

---

### Чего НЕ нужно
- HAR-файлы и WebSocket-фреймы — данные берём обычным запросом;
- дата регистрации — уже закрыта публичным `api.chess.com/pub/player/{ник}`, проверено;
- селекторы ников — известны из chess-com-insights, шаг 4 нужен только для проверки, что они актуальны.
