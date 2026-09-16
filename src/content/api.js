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
  _needsPlayerId: null, // выясняется на первом запросе

  /**
   * Партии игрока начиная с sinceMs. Возвращает { games, profile, source }.
   * games нормализованы относительно запрошенного игрока.
   */
  async playerGames(username, sinceMs) {
    const key = username.toLowerCase()
    const hit = this._cache.get(key)
    if (hit && Date.now() - hit.ts < this.TTL_MS) return hit.payload

    let payload
    try {
      payload = await this._internal(username, sinceMs)
    } catch (err) {
      console.warn("[CCD] внутренний эндпоинт недоступен, откат на публичный API:", err)
      payload = await this._public(username, sinceMs)
    }

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

  async _hydrate(username, page) {
    // Сначала пробуем без playerId; если сервер его требует, достаём uuid и повторяем
    if (this._needsPlayerId !== true) {
      const res = await this._post({ username, page })
      if (res.ok) {
        this._needsPlayerId = false
        return res.json()
      }
      if (this._needsPlayerId === false) throw new Error("HTTP " + res.status)
      this._needsPlayerId = true
    }

    const playerId = await this._resolveUuid(username)
    const res = await this._post({ username, playerId, page })
    if (!res.ok) throw new Error("HTTP " + res.status)
    return res.json()
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

  /** uuid игрока из HTML профиля; кэшируется навсегда — он не меняется */
  async _resolveUuid(username) {
    const key = "ccd:uuid:" + username.toLowerCase()
    const stored = await chrome.storage.local.get(key)
    if (stored[key]) return stored[key]

    const url = "https://www.chess.com/member/" + encodeURIComponent(username.toLowerCase())
    const html = await (await fetch(url, { credentials: "include" })).text()
    const match = html.match(
      /profile-header-container[^>]*data-username="([^"]+)"[^>]*data-user-id="([^"]+)"[^>]*data-user-uuid="([^"]+)"/i
    )
    if (!match) throw new Error("uuid не найден для " + username)

    await chrome.storage.local.set({ [key]: match[3] })
    return match[3]
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
      if (!res.ok) continue
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
