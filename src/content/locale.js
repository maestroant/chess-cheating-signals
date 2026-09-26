// Язык интерфейса chess.com. Сайт помнит его в аккаунте, а не в браузере,
// поэтому определяем по самой странице, а не по navigator.language.
globalThis.CCD = globalThis.CCD || {}

CCD.locale = {
  FALLBACK: "en",

  /** Языки, для которых у нас есть словарь в i18n/ */
  supported() {
    return Object.keys(CCD.i18n.LANGUAGES)
  },

  /**
   * Коды, под которыми тот же язык может прийти от сайта или браузера.
   * Слева всегда нижний регистр: сравниваем приведёнными.
   */
  ALIASES: {
    tl: "fil",
    "fil-ph": "fil",
    vls: "nl-BE",
    "nl-be": "nl-BE",
    "pt-pt": "pt",
    "pt-br": "pt-BR",
    br: "pt-BR",
    "zh-cn": "zh",
    "zh-sg": "zh",
    "zh-hans": "zh",
    "zh-hk": "zh-HK",
    "zh-mo": "zh-HK",
    "zh-tw": "zh-TW",
    "zh-hant": "zh-TW",
    nb: "no",
    nn: "no",
    // устаревшие коды, которые до сих пор встречаются в браузерах
    iw: "he",
    in: "id",
    sh: "sr"
  },

  /**
   * Что стоит на странице, как есть: может быть "ru", "ru-RU", "zh-CN".
   * @returns {{code:string, source:string}}
   */
  detect() {
    const html = document.documentElement.getAttribute("lang")
    if (html) return { code: html, source: "html[lang]" }

    const og = document.querySelector('meta[property="og:locale"]')?.content
    if (og) return { code: og.replace("_", "-"), source: "og:locale" }

    const meta = document.querySelector('meta[http-equiv="content-language" i]')?.content
    if (meta) return { code: meta.split(",")[0].trim(), source: "meta content-language" }

    const path = this.fromPath(location.pathname)
    if (path) return { code: path, source: "путь" }

    // сюда доходим, только если сайт не сказал ничего: язык браузера — худшее, но хоть что-то
    return { code: navigator.language, source: "navigator" }
  },

  /**
   * Язык из начала пути: chess.com отдаёт /ru/play/online. Сверяемся со списком —
   * двухбуквенный сегмент сам по себе языка не доказывает, есть и /tv.
   */
  fromPath(pathname) {
    const first = String(pathname).split("/")[1]?.toLowerCase()
    if (!first) return null

    const known = new Set([
      ...this.supported().map((code) => code.toLowerCase()),
      ...this.supported().map((code) => code.split("-")[0].toLowerCase()),
      ...Object.keys(this.ALIASES)
    ])
    return known.has(first) ? first : null
  },

  /** Приводим код сайта к языку, словарь для которого у нас есть */
  resolve(code) {
    const want = String(code || "").replace("_", "-").trim().toLowerCase()
    if (!want) return this.FALLBACK

    if (this.ALIASES[want]) return this.ALIASES[want]

    const exact = this.supported().find((lang) => lang.toLowerCase() === want)
    if (exact) return exact

    // "ru-RU" → "ru", "es-MX" → "es"; регион нам неважен
    const base = want.split("-")[0]
    if (this.ALIASES[base]) return this.ALIASES[base]

    return this.supported().find((lang) => lang.toLowerCase() === base) || this.FALLBACK
  },

  /** Язык страницы. Считается один раз: без перезагрузки он не меняется */
  current() {
    if (this._current) return this._current

    const found = this.detect()
    this._current = this.resolve(found.code)
    // console.log(
    //   "[CCD] язык сайта:", found.code || "нет",
    //   "(источник: " + found.source + ")",
    //   "→ интерфейс:", this._current
    // )
    return this._current
  }
}
