// Точка входа: следим за страницей и обновляем карточки игроков
globalThis.CCD = globalThis.CCD || {}

CCD.main = {
  LOAD_DELAY: 1200, // chess.com дорисовывает строки игроков не сразу
  RECHECK_DELAY: 400,

  _timer: null,
  _busy: false,

  init() {
    this.schedule()

    // Vue перерисовывает строку игрока и стирает наши узлы, поэтому следим за DOM
    new MutationObserver(() => this.schedule(this.RECHECK_DELAY, true)).observe(
      document.documentElement,
      { childList: true, subtree: true }
    )

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action !== "settings-updated") return
      CCD.settings.invalidate()
      CCD.api._cache.clear()
      for (const role of CCD.ui.ROLES) CCD.ui.clear(role)
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
    for (const role of CCD.ui.ROLES) {
      const username = CCD.ui.username(role)
      const mounted = CCD.ui.mounted(role)
      if (!username) continue
      if (!mounted || mounted.dataset.ccdUser !== username) return true
    }
    return false
  },

  async update() {
    if (this._busy) return
    this._busy = true

    try {
      const s = await CCD.settings.get()

      for (const role of CCD.ui.ROLES) {
        const username = CCD.ui.username(role)

        if (!username || (role === "self" && !s.showOwnIndicator)) {
          CCD.ui.clear(role)
          continue
        }

        try {
          const since = Date.now() - s.windowHours * 3600 * 1000
          const payload = await CCD.api.playerGames(username, since)
          const stats = CCD.analyze.run(payload, s)

          if (role === "self") await CCD.ui.renderIndicator(role, stats, username)
          else await CCD.ui.renderBadges(role, stats, username)
        } catch (err) {
          console.warn("[CCD] не удалось обновить", username, err)
          CCD.ui.clear(role)
        }
      }
    } finally {
      this._busy = false
    }
  }
}

CCD.main.init()
