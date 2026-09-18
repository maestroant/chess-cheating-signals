// Точка входа: следим за страницей и обновляем карточки игроков
globalThis.CCD = globalThis.CCD || {}

CCD.main = {
  LOAD_DELAY: 1200, // chess.com дорисовывает карточки не сразу
  RECHECK_DELAY: 400,

  _timer: null,
  _busy: false,

  init() {
    console.log("[CCD] content script загружен:", location.pathname)
    CCD.locale.current()
    this.schedule()

    // Vue перерисовывает карточки и стирает наши узлы, поэтому следим за DOM
    this._observer = new MutationObserver(() => this.schedule(this.RECHECK_DELAY, true))
    this._observer.observe(document.documentElement, { childList: true, subtree: true })

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action !== "settings-updated") return
      CCD.settings.invalidate()
      CCD.api._cache.clear()
      document.querySelectorAll("[data-ccd-role]").forEach((el) => el.remove())
      this.schedule(0)
    })
  },

  /**
   * Жив ли ещё наш контекст. Расширение перезагрузили, а эта копия скрипта
   * осталась на уже открытой странице: chrome.* здесь бросает «Extension context
   * invalidated», render() падает, и catch ниже снимает вполне живые бейджи на
   * каждую перерисовку Vue. Данных такому скрипту не видать уже никогда.
   */
  alive() {
    return Boolean(chrome.runtime?.id)
  },

  /** Уходим тихо и оставляем нарисованное на месте: его обновит перезагрузка страницы */
  stop() {
    if (this._stopped) return
    this._stopped = true
    clearTimeout(this._timer)
    this._observer?.disconnect()
    console.log("[CCD] расширение перезагружено — обновите страницу")
  },

  schedule(delay = this.LOAD_DELAY, onlyIfStale = false) {
    if (this._stopped) return
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

  /** На странице говорим на языке интерфейса chess.com, а не браузера */
  async applyLanguage() {
    return CCD.i18n.use(CCD.locale.current())
  },

  async update() {
    if (this._busy || this._stopped) return
    if (!this.alive()) return this.stop()
    this._busy = true

    try {
      const s = await CCD.settings.get()
      await this.applyLanguage()
      const targets = CCD.ui.targets()

      // карточек может не быть вовсе — страница со списком партий, например
      if (!targets.length) return

      console.log("[CCD] цели:", targets.map((t) => t.role + "=" + t.username).join(", "))

      for (const target of targets) {
        const own = target.kind === "indicator"
        const nothingToShow = own
          ? !s.showOwnIndicator
          : !s.showOpponentIndicator && !s.showBadges

        if (nothingToShow) {
          CCD.ui.clear(target.role)
          continue
        }

        try {
          const since = Date.now() - s.windowHours * 3600 * 1000
          const payload = await CCD.api.playerGames(target.username, since)
          const stats = CCD.analyze.run(payload, s)

          console.log(
            "[CCD]", target.username,
            "партий:", stats.total,
            "W/L/D:", stats.wld.win + "/" + stats.wld.loss + "/" + stats.wld.draw,
            "винрейт:", Math.round(stats.winRate) + "%",
            "точность:", stats.accuracy ? Math.round(stats.accuracy) + "% по " + stats.accGames : "нет",
            "бейджи:", stats.badges.join(",") || "нет",
            "дебют:", stats.opening || "нет",
            "источник:", payload.source
          )

          await CCD.ui.render(target, stats, s)
        } catch {
          // партии не пришли — снимаем бейджи, чтобы не оставить на карточке устаревшие.
          // Но мёртвый контекст — не повод: там падает не запрос, а chrome.*
          if (!this.alive()) return this.stop()
          CCD.ui.clear(target.role)
        }
      }
    } finally {
      this._busy = false
    }
  }
}

CCD.main.init()
