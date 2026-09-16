// Расчёт статистики и бейджей
globalThis.CCD = globalThis.CCD || {}

CCD.analyze = {
  /**
   * @param {object} payload результат CCD.api.playerGames
   * @param {object} s настройки
   * @returns {{wld, winRate, accuracy, badges, source, device}}
   */
  run(payload, s) {
    const since = Date.now() - s.windowHours * 3600 * 1000
    const games = payload.games.filter(
      (g) => g.endedAt >= since && s.timeClasses.includes(g.timeClass)
    )

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

  /** Устройство из поля client последней партии */
  device(games) {
    const client = games.find((g) => g.client)?.client
    if (!client) return null
    return /iphone|ipad|android|mobile|ios/i.test(client) ? "phone" : "pc"
  }
}
