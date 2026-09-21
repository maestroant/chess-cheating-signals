// Настройки: значения по умолчанию + чтение из chrome.storage.sync
globalThis.CCD = globalThis.CCD || {}

CCD.DEFAULTS = {
  windowHours: 12,        // окно анализа
  minGames: 5,            // минимум партий для LUCKY / COLD
  minAccuracyGames: 3,    // минимум разобранных партий для HIGH
  luckyWinRate: 70,       // % побед для LUCKY
  coldWinRate: 30,        // % побед для COLD
  highAccuracy: 85,       // средняя точность для HIGH
  newAccountMonths: 3,    // возраст аккаунта для NEW
  timeClasses: ["BULLET", "BLITZ", "RAPID"],
  showBadges: true,
  showOpponentIndicator: false,  // по умолчанию у соперника только бейджи
  showOwnIndicator: true
}

CCD.settings = {
  _cache: null,

  async get(force = false) {
    if (this._cache && !force) return this._cache
    const stored = await chrome.storage.sync.get(CCD.DEFAULTS)
    const settings = { ...CCD.DEFAULTS, ...stored }
    // порог COLD не может быть выше порога LUCKY, иначе оба бейджа сойдутся на одном проценте
    settings.coldWinRate = Math.min(settings.coldWinRate, settings.luckyWinRate)

    this._cache = settings
    return this._cache
  },

  invalidate() {
    this._cache = null
  },

  /**
   * Настройки меняются и мимо попапа: его сообщение не дойдёт до вкладки со
   * старой копией скрипта, а sendMessage там отказывает молча. Кэш при этом
   * живёт до перезагрузки страницы — и человек видит старую картинку, хотя
   * галку давно поставил. Слушаем само хранилище: оно меняется всегда.
   */
  watch(onChange) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return
      this.invalidate()
      onChange()
    })
  }
}
