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
  showLucky: true,
  showNew: true,
  showHigh: true,
  showCold: true,
  showOwnIndicator: true
}

CCD.settings = {
  _cache: null,

  async get(force = false) {
    if (this._cache && !force) return this._cache
    const stored = await chrome.storage.sync.get(CCD.DEFAULTS)
    this._cache = { ...CCD.DEFAULTS, ...stored }
    return this._cache
  },

  invalidate() {
    this._cache = null
  }
}
