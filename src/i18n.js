// Загрузка переводов. Свой загрузчик, а не chrome.i18n: тот жёстко привязан к языку
// браузера, а расширение должно говорить на языке интерфейса chess.com.
globalThis.CCD = globalThis.CCD || {}

CCD.i18n = {
  FALLBACK: "en",
  /** Языки с письмом справа налево */
  RTL: ["ar", "fa", "he", "ur"],

  /** Языки chess.com: код → самоназвание (им подписан выбор языка в попапе) */
  LANGUAGES: {
    af: "Afrikaans",
    ar: "العربية",
    az: "Azərbaycanca",
    be: "Беларуская",
    bg: "Български",
    bn: "বাংলা",
    bs: "Bosanski",
    ca: "Català",
    cs: "Čeština",
    da: "Dansk",
    de: "Deutsch",
    el: "Ελληνικά",
    en: "English",
    es: "Español",
    et: "Eesti",
    fa: "فارسی",
    fi: "Suomi",
    fil: "Pilipino",
    fr: "Français",
    gl: "Galego",
    he: "עברית",
    hi: "हिन्दी",
    hr: "Hrvatski",
    hu: "Magyar",
    hy: "Հայերեն",
    id: "Bahasa Indonesia",
    is: "Íslenska",
    it: "Italiano",
    ja: "日本語",
    ka: "ქართული",
    ko: "한국어",
    lt: "Lietuvių",
    lv: "Latviešu",
    ms: "Bahasa Melayu",
    nl: "Nederlands",
    "nl-BE": "Vlaams",
    no: "Norsk",
    pl: "Polski",
    pt: "Português",
    "pt-BR": "Português (BR)",
    ro: "Română",
    ru: "Русский",
    sk: "Slovenčina",
    sl: "Slovenščina",
    sq: "Shqipe",
    sr: "Српски",
    sv: "Svenska",
    tk: "Türkmençe",
    tr: "Türkçe",
    uk: "Українська",
    ur: "اُردُو",
    vi: "Tiếng Việt",
    zh: "中文",
    "zh-HK": "中文（香港）",
    "zh-TW": "中文（台灣）",
  },

  _dicts: new Map(),

  lang: "en",
  messages: {},

  /** Словарь одного языка. Файл лежит в i18n/ и открыт через web_accessible_resources */
  dict(lang) {
    const cached = this._dicts.get(lang)
    if (cached) return cached

    const promise = fetch(chrome.runtime.getURL("i18n/" + lang + ".json")).then((r) => {
      if (!r.ok) throw new Error("i18n " + lang + ": HTTP " + r.status)
      return r.json()
    })

    // осечку не кэшируем: иначе одна неудача навсегда оставила бы расширение без строк
    promise.catch(() => this._dicts.delete(lang))
    this._dicts.set(lang, promise)
    return promise
  },

  /** Переключение языка. Ключи, которых нет в переводе, остаются английскими */
  async use(lang) {
    if (this.lang === lang && Object.keys(this.messages).length) return this.messages

    const base = await this.dict(this.FALLBACK).catch((err) => {
      console.warn("[CCD] не читается английский словарь:", err)
      return {}
    })

    const translated =
      lang === this.FALLBACK
        ? {}
        : await this.dict(lang).catch((err) => {
            console.warn("[CCD] нет перевода для", lang, err)
            return {}
          })

    this.lang = lang
    this.messages = { ...base, ...translated }
    return this.messages
  },

  /** $1…$9 в строке заменяются на аргументы по порядку */
  t(key, ...args) {
    const text = this.messages[key]
    if (text == null) return key

    return String(text).replace(/\$(\d)/g, (_, index) => {
      const value = args[Number(index) - 1]
      return value == null ? "" : String(value)
    })
  },

  isRtl(lang = this.lang) {
    return this.RTL.includes(String(lang).split("-")[0])
  }
}
