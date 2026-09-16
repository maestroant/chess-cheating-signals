// Точка входа: следим за страницей и обновляем карточки игроков
globalThis.CCD = globalThis.CCD || {}

CCD.main = {
  LOAD_DELAY: 1200, // chess.com дорисовывает карточки не сразу
  RECHECK_DELAY: 400,

  _timer: null,
  _busy: false,

  init() {
    console.log("[CCD] content script загружен:", location.pathname)
    this.schedule()

    // Vue перерисовывает карточки и стирает наши узлы, поэтому следим за DOM
    new MutationObserver(() => this.schedule(this.RECHECK_DELAY, true)).observe(
      document.documentElement,
      { childList: true, subtree: true }
    )

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action !== "settings-updated") return
      CCD.settings.invalidate()
      CCD.api._cache.clear()
      document.querySelectorAll("[data-ccd-role]").forEach((el) => el.remove())
      this.schedule(0)
    })
  },

  schedule(delay = this.LOAD_DELAY, onlyIfStale = false) {
    if (onlyIfStale && !this.isStale()) return
    clearTimeout(this._timer)
    this._timer = setTimeout(() => this.update(), delay)
  },

  /** Нужна ли перерисовка: сменился игрок или Vue снёс наш элемент */
  isStale() {
    return CCD.ui.targets().some((t) => {
      const mounted = CCD.ui.mounted(t.role)
      return !mounted || mounted.dataset.ccdUser !== t.username
    })
  },

  async update() {
    if (this._busy) return
    this._busy = true

    try {
      const s = await CCD.settings.get()
      const targets = CCD.ui.targets()

      if (!targets.length) {
        console.warn("[CCD] карточки игроков не найдены:", location.pathname)
        return
      }

      for (const target of targets) {
        if (target.kind === "indicator" && !s.showOwnIndicator) {
          CCD.ui.clear(target.role)
          continue
        }

        try {
          const since = Date.now() - s.windowHours * 3600 * 1000
          const payload = await CCD.api.playerGames(target.username, since)
          const stats = CCD.analyze.run(payload, s)

          console.debug(
            "[CCD]", target.username,
            "партий:", stats.total,
            "W/L/D:", stats.wld.win + "/" + stats.wld.loss + "/" + stats.wld.draw,
            "винрейт:", Math.round(stats.winRate) + "%",
            "точность:", stats.accuracy ? Math.round(stats.accuracy) + "% по " + stats.accGames : "нет",
            "бейджи:", stats.badges.join(",") || "нет",
            "источник:", payload.source
          )

          await CCD.ui.render(target, stats, s)
        } catch (err) {
          console.warn("[CCD] не удалось обновить", target.username, err)
          CCD.ui.clear(target.role)
        }
      }
    } finally {
      this._busy = false
    }
  }
}

CCD.main.init()
