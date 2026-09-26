// Источники данных: внутренний эндпоинт chess.com + публичный API как запасной
globalThis.CCD = globalThis.CCD || {}

CCD.api = {
  ENDPOINT:
    "https://www.chess.com/service/player-game-archive-v2/" +
    "chesscom.game_gateway.v2.GameGatewayService/HydrateGamesByCriteria",
  PAGE_SIZE: 50,
  MAX_PAGES: 3,
  TTL_MS: 60000,

  _cache: new Map(), // ник в нижнем регистре -> { ts, payload }

  /**
   * Партии игрока начиная с sinceMs. Возвращает { games, profile, source }.
   * games нормализованы относительно запрошенного игрока.
   */
  async playerGames(username, sinceMs) {
    const key = username.toLowerCase()
    const hit = this._cache.get(key)
    if (hit && Date.now() - hit.ts < this.TTL_MS) {
      // console.log("[CCD] " + username + ": из кэша,", hit.payload.games.length, "партий")
      return hit.payload
    }

    let payload
    try {
      payload = await this._internal(username, sinceMs)
    } catch (e) {
      // откат на публичный API — штатный путь, но причину теперь показываем:
      // именно здесь теряются партии, когда chess.com просит паузу
      console.warn("[CCD] " + username + ": внутренний API мимо —", e.message, "→ идём в публичный")
      payload = await this._public(username, sinceMs)
    }

    // console.log(
    //   "[CCD] " + username + ":", payload.games.length, "партий из", payload.source,
    //   "| профиль:", payload.profile?.username || "нет"
    // )

    this._cache.set(key, { ts: Date.now(), payload })
    return payload
  },

  // ---------- внутренний эндпоинт ----------

  async _internal(username, sinceMs) {
    const games = []
    let profile = null

    for (let page = 1; page <= this.MAX_PAGES; page++) {
      const raw = await this._hydrate(username, page)
      const list = raw?.hydratedGames ?? []
      if (!list.length) break

      for (const item of list) {
        const game = this._normalize(item, username)
        if (!game) continue
        if (game.profile && !profile) profile = game.profile
        if (game.endedAt >= sinceMs) games.push(game)
      }

      const oldest = Math.min(...list.map((i) => Date.parse(i.game.endedAt)))
      if (list.length < this.PAGE_SIZE || oldest < sinceMs) break
    }

    return { games, profile, source: "internal" }
  },

  /** Разовый лог структуры ответа: показывает, какие блоки реально приходят */
  _logShape(raw) {
    if (this._shapeLogged) return
    this._shapeLogged = true

    const first = raw?.hydratedGames?.[0]
    if (!first) return

    // console.log(
    //   "[CCD] блоки ответа:", Object.keys(first).join(", "),
    //   "| дебют:", first.openingMetadata?.ecoFamilyName ?? "НЕТ",
    //   "| точность:", first.analysisMetadata?.whitePlayerMetadata?.accuracy ?? "НЕТ",
    //   "| профиль:", first.playerMetadata?.whitePlayerMetadata?.username ?? "НЕТ"
    // )
  },

  async _hydrate(username, page) {
    // Сам сайт всегда шлёт playerId (см. devtools/01-request-payload.json), поэтому
    // достаём его сразу: запрос без него сервер отвергает с 400.
    // uuid может не найтись: чужой профиль, изменённая разметка. Тогда пробуем без него
    const playerId = await this._resolveUuid(username).catch((e) => {
      // раньше здесь было молчаливое `() => null`, и отказ выглядел как
      // «просто нет uuid»: причина (429, изменённая разметка, сеть) пропадала,
      // а дальше всё честно валилось в публичный API и выглядело исправным.
      // Но собственная пауза — не диагноз, а ожидаемое состояние: она молчит,
      // иначе одно и то же предупреждение идёт на каждую перерисовку DOM
      if (!e.quiet) console.warn("[CCD] uuid не достался для " + username + ":", e.message)
      return null
    })

    const res = await this._post(playerId ? { username, playerId, page } : { username, page })
    if (!res.ok) {
      // сохранённый uuid мог устареть или оказаться мусором — иначе он валил бы
      // запросы бесконечно, ведь кэш в storage.local переживает перезагрузку.
      // Но об uuid говорит только 400: на 429 и 5xx сервер сообщает о себе, а не
      // о нём. Пока забывали на любой не-ok, один отказ стирал кэш, и следующий
      // проход шёл качать HTML профиля — то есть ровно туда, откуда прилетел
      // отказ. Так один 429 превращался в бесконечную череду новых.
      if (playerId && res.status === 400) await this._forgetUuid(username)

      // 429 с любого адреса chess.com — просьба притормозить целиком: лимит
      // считается по IP, а не по эндпоинту.
      if (res.status === 429) await this._pauseProfile(res.headers.get("retry-after"))

      // у Connect-RPC причина лежит в теле ответа — без неё 400 не отладить
      const detail = (await res.text().catch(() => "")).slice(0, 300)
      throw new Error(
        "HTTP " + res.status +
        (playerId ? " (playerId: " + playerId + ")" : " (без playerId)") +
        (detail ? " " + detail : "")
      )
    }

    const raw = await res.json()
    this._logShape(raw)
    return raw
  },

  _post(body) {
    return fetch(this.ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({
        isVsComputer: false,
        isVsCoach: false,
        pageSize: this.PAGE_SIZE,
        ...body
      })
    })
  },

  /** uuid игрока; кэшируется навсегда — он не меняется */
  async _resolveUuid(username) {
    const key = "ccd:uuid:" + username.toLowerCase()
    const stored = await chrome.storage.local.get(key)
    if (stored[key]) return stored[key]

    // на странице профиля uuid лежит прямо в data-атрибутах — качать HTML не нужно
    const uuid =
      this._uuidFromDocument(document, username) || (await this._uuidFromProfile(username))
    if (!uuid) throw new Error("нет data-user-uuid в профиле " + username)
    if (!this.UUID_RE.test(uuid)) throw new Error("не похоже на uuid: " + uuid)

    await chrome.storage.local.set({ [key]: uuid })
    return uuid
  },

  UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

  /**
   * Пауза после 429. Retry-After приходит и числом секунд, и датой по RFC —
   * принимаем оба, а когда заголовка нет (chess.com шлёт его не всегда), берём
   * свои 10 минут. Потолок в час — чтобы кривая дата не выключила расширение.
   */
  _pauseProfile(retryAfter) {
    const secs = Number(retryAfter)
    const fromHeader =
      Number.isFinite(secs) && secs > 0 ? secs * 1000 : Date.parse(retryAfter) - Date.now()
    const ms = fromHeader > 0 ? fromHeader : this.COOLDOWN_MS

    console.warn("[CCD] chess.com просит паузу:", Math.round(Math.min(ms, this.MAX_COOLDOWN_MS) / 1000), "с")
    return chrome.storage.local.set({
      [this.COOLDOWN_KEY]: Date.now() + Math.min(ms, this.MAX_COOLDOWN_MS)
    })
  },

  _forgetUuid(username) {
    return chrome.storage.local.remove("ccd:uuid:" + username.toLowerCase())
  },

  /** Отказ по собственному тормозу: ждать — штатно, поэтому в консоль не идёт */
  _quiet(message) {
    const e = new Error(message)
    e.quiet = true
    return e
  },

  /** uuid из готового документа: ищем узел, который подписан нужным ником */
  _uuidFromDocument(doc, username) {
    const lower = username.toLowerCase()
    for (const el of doc.querySelectorAll("[data-username][data-user-uuid]")) {
      if (el.getAttribute("data-username")?.toLowerCase() === lower) {
        return el.getAttribute("data-user-uuid")
      }
    }
    return null
  },

  // Обе метки живут в storage.local, а не в памяти: цикл запросов перезапускала
  // как раз навигация, а её переменная модуля не переживает.
  COOLDOWN_KEY: "ccd:profile-cooldown", // до какого времени не трогаем chess.com
  TRIED_KEY: "ccd:profile-tried:",      // когда последний раз качали профиль ника
  COOLDOWN_MS: 600000,                  // 10 минут, если сервер не сказал иначе
  MAX_COOLDOWN_MS: 3600000,
  RETRY_MS: 120000,

  async _uuidFromProfile(username) {
    const triedKey = this.TRIED_KEY + username.toLowerCase()
    const saved = await chrome.storage.local.get([this.COOLDOWN_KEY, triedKey])
    const now = Date.now()

    // 429 — это просьба остановиться, а не повод повторить. Без паузы запрос
    // уходил на каждый update(), то есть на каждую перерисовку DOM.
    if (now < (saved[this.COOLDOWN_KEY] || 0)) {
      throw this._quiet("профиль " + username + ": пауза после 429")
    }

    // Страница профиля весит около мегабайта, и промах по ней (разметку
    // поменяли, uuid не нашёлся) повторялся бы с той же частотой, ничего не
    // меняя. Отметку ставим до запроса: неудачная попытка — тоже попытка.
    if (now - (saved[triedKey] || 0) < this.RETRY_MS) {
      throw this._quiet("профиль " + username + ": недавно уже пробовали")
    }
    await chrome.storage.local.set({ [triedKey]: now })

    const url = "https://www.chess.com/member/" + encodeURIComponent(username.toLowerCase())
    const res = await fetch(url, { credentials: "include" })
    if (res.status === 429) await this._pauseProfile(res.headers.get("retry-after"))
    if (!res.ok) throw new Error("профиль " + username + ": HTTP " + res.status)

    // разбираем разметку, а не регулярку: порядок атрибутов chess.com уже менял
    const doc = new DOMParser().parseFromString(await res.text(), "text/html")
    return this._uuidFromDocument(doc, username)
  },

  RESULTS: {
    PLAYER_RESULT_WIN: "win",
    PLAYER_RESULT_LOSE: "loss",
    PLAYER_RESULT_DRAW: "draw"
  },

  /** Приводим партию к виду со стороны запрошенного игрока */
  _normalize(item, username) {
    const game = item?.game
    const chess = game?.chessGame
    if (!chess) return null

    const lower = username.toLowerCase()
    const side =
      chess.whitePlayer?.displayName?.toLowerCase() === lower
        ? "white"
        : chess.blackPlayer?.displayName?.toLowerCase() === lower
          ? "black"
          : null
    if (!side) return null

    const player = chess[side + "Player"]
    const meta = item.playerMetadata?.[side + "PlayerMetadata"]
    const accuracy = item.analysisMetadata?.[side + "PlayerMetadata"]?.accuracy

    return {
      endedAt: Date.parse(game.endedAt),
      timeClass: this.normalizeTimeClass(game.timeClass),
      result: this.RESULTS[player.result] ?? null,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      rating: player.finalRating ?? null,
      ratingDiff: player.ratingDiff ?? null,
      client: player.client ?? null,
      moveTimes: chess.moveTimestamps ?? null,
      opening: item.openingMetadata?.ecoFamilyName ?? null,
      profile: meta
        ? {
            username: meta.username,
            createdAt: Date.parse(meta.createdAt),
            membership: meta.membership,
            country: meta.country
          }
        : null
    }
  },

  normalizeTimeClass(value) {
    const t = String(value || "").replace("TIME_CLASS_", "").toUpperCase()
    if (t === "HYPERBULLET" || t === "LIGHTNING") return "BULLET"
    if (t === "CLASSICAL" || t === "STANDARD") return "RAPID"
    return t
  },

  // ---------- публичный API (запасной вариант) ----------

  async _public(username, sinceMs) {
    const user = encodeURIComponent(username.toLowerCase())
    const games = []

    for (const [year, month] of this._monthsBetween(sinceMs)) {
      const res = await fetch(
        "https://api.chess.com/pub/player/" + user + "/games/" + year + "/" + month
      )
      if (!res.ok) {
        console.warn("[CCD] " + username + ": публичный API " + year + "/" + month + " — HTTP " + res.status)
        continue
      }
      const data = await res.json()
      for (const game of data.games ?? []) {
        const normalized = this._normalizePublic(game, username)
        if (normalized && normalized.endedAt >= sinceMs) games.push(normalized)
      }
    }

    const res = await fetch("https://api.chess.com/pub/player/" + user)
    const info = res.ok ? await res.json() : null

    return {
      games,
      profile: info
        ? {
            username: info.username,
            createdAt: info.joined * 1000,
            membership: info.status,
            country: String(info.country || "").split("/").pop()
          }
        : null,
      source: "public"
    }
  },

  PUBLIC_RESULTS: {
    win: "win",
    checkmated: "loss",
    resigned: "loss",
    timeout: "loss",
    abandoned: "loss",
    lose: "loss",
    bughousepartnerlose: "loss",
    agreed: "draw",
    repetition: "draw",
    stalemate: "draw",
    insufficient: "draw",
    "50move": "draw",
    timevsinsufficient: "draw"
  },

  // Название семейства дебюта заканчивается одним из этих слов
  ECO_TAIL: ["opening", "defense", "defence", "system", "attack", "gambit", "game"],

  /**
   * Публичный API отдаёт не название, а ссылку:
   *   .../openings/Caro-Kann-Defense-Advance-Variation...4.Nf3-e6
   * Вытаскиваем из неё название семейства — до слова вроде Defense включительно.
   */
  openingFromEcoUrl(url) {
    if (!url) return null

    const slug = String(url).split("/").pop().split("...")[0]
    if (!slug) return null

    const words = slug.split("-").filter(Boolean)
    const end = words.findIndex((w) => this.ECO_TAIL.includes(w.toLowerCase()))

    return (end === -1 ? words.slice(0, 3) : words.slice(0, end + 1)).join(" ") || null
  },

  _normalizePublic(game, username) {
    const lower = username.toLowerCase()
    const side =
      game.white?.username?.toLowerCase() === lower
        ? "white"
        : game.black?.username?.toLowerCase() === lower
          ? "black"
          : null
    if (!side) return null

    const accuracy = game.accuracies?.[side]
    return {
      endedAt: game.end_time * 1000,
      timeClass: this.normalizeTimeClass(game.time_class),
      result: this.PUBLIC_RESULTS[game[side].result] ?? null,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      rating: game[side].rating ?? null,
      ratingDiff: null,
      client: null,
      moveTimes: null,
      opening: this.openingFromEcoUrl(game.eco),
      profile: null
    }
  },

  /** [ [год, месяц], ... ] — текущий месяц и предыдущий, если окно его задевает */
  _monthsBetween(sinceMs) {
    const pad = (n) => String(n).padStart(2, "0")
    const now = new Date()
    const since = new Date(sinceMs)
    const months = [[now.getUTCFullYear(), pad(now.getUTCMonth() + 1)]]
    if (since.getUTCMonth() !== now.getUTCMonth()) {
      months.push([since.getUTCFullYear(), pad(since.getUTCMonth() + 1)])
    }
    return months
  }
}
