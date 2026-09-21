// Расчёт статистики и бейджей
globalThis.CCD = globalThis.CCD || {}

CCD.analyze = {
  /**
   * @param {object} payload результат CCD.api.playerGames
   * @param {object} s настройки
   * @returns {{wld, winRate, accuracy, badges, source, device, opening}}
   */
  run(payload, s) {
    const since = Date.now() - s.windowHours * 3600 * 1000
    const games = payload.games.filter(
      (g) => g.endedAt >= since && s.timeClasses.includes(g.timeClass)
    )

    // видно, куда делись партии: за окно по времени или под отсев по тайм-контролю
    if (games.length !== payload.games.length) {
      const classes = {}
      for (const g of payload.games) classes[g.timeClass] = (classes[g.timeClass] || 0) + 1
      console.log(
        "[CCD] отсев:", payload.games.length, "→", games.length,
        "| в ответе:", JSON.stringify(classes),
        "| учитываем:", s.timeClasses.join(",")
      )
    }

    const wld = { win: 0, loss: 0, draw: 0 }
    let accSum = 0
    let accGames = 0

    for (const g of games) {
      if (g.result && wld[g.result] !== undefined) wld[g.result]++
      if (typeof g.accuracy === "number") {
        accSum += g.accuracy
        accGames++
      }
    }

    const total = wld.win + wld.loss + wld.draw
    const winRate = total ? (wld.win / total) * 100 : 0
    const accuracy = accGames ? accSum / accGames : null

    return {
      wld,
      total,
      winRate,
      accuracy,
      accGames,
      source: payload.source,
      device: this.device(games),
      opening: this.latest(games, "opening"),
      badges: this.badges({ total, winRate, accuracy, accGames, profile: payload.profile }, s)
    }
  },

  badges(stats, s) {
    const list = []
    if (!s.showBadges) return list

    if (stats.total > s.minGames && stats.winRate > s.luckyWinRate) {
      list.push("lucky")
    }
    if (stats.profile?.createdAt) {
      const ageMs = Date.now() - stats.profile.createdAt
      if (ageMs < s.newAccountMonths * 30 * 24 * 3600 * 1000) list.push("new")
    }
    if (
      stats.accGames >= s.minAccuracyGames &&
      stats.accuracy !== null &&
      stats.accuracy > s.highAccuracy
    ) {
      list.push("high")
    }
    if (stats.total > s.minGames && stats.winRate < s.coldWinRate) {
      list.push("cold")
    }

    return list
  },

  /** Значение поля из самой свежей партии, где оно заполнено */
  latest(games, key) {
    let found = null
    for (const game of games) {
      if (game[key] == null) continue
      if (!found || game.endedAt > found.endedAt) found = game
    }
    return found ? found[key] : null
  },

  /** Устройство из поля client последней партии */
  device(games) {
    const client = this.latest(games, "client")
    if (!client) return null
    return /iphone|ipad|android|mobile|ios/i.test(client) ? "phone" : "pc"
  }
}
