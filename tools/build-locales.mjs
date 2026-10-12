// Пересобирает _locales/ из i18n/.
//
// Строки интерфейса расширение берёт из i18n/ само (см. src/i18n.js): chrome.i18n
// привязан к языку браузера и для языка сайта не годится. Но имя и описание в
// Chrome Web Store браузер читает только из _locales, поэтому эти два ключа
// дублируются туда — и только для языков, которые Chrome у себя знает.
//
// Запуск: node tools/build-locales.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/** наш код языка → папка _locales. Языков Chrome меньше, чем у chess.com */
const CHROME_LOCALES = {
  ar: "ar", bg: "bg", bn: "bn", ca: "ca", cs: "cs", da: "da", de: "de", el: "el",
  en: "en", es: "es", et: "et", fa: "fa", fi: "fi", fil: "fil", fr: "fr", he: "he",
  hi: "hi", hr: "hr", hu: "hu", id: "id", it: "it", ja: "ja", ko: "ko", lt: "lt",
  lv: "lv", ms: "ms", nl: "nl", no: "no", pl: "pl", pt: "pt_PT", "pt-BR": "pt_BR",
  ro: "ro", ru: "ru", sk: "sk", sl: "sl", sr: "sr", sv: "sv", tr: "tr", uk: "uk",
  vi: "vi", zh: "zh_CN", "zh-TW": "zh_TW"
}

// Остальные языки (af, az, be, bs, gl, hy, is, ka, nl-BE, sq, tk, ur, zh-HK)
// Chrome в _locales не принимает: интерфейс расширения у них переведён,
// а карточка в магазине показывается по-английски.

const STORE_KEYS = ["extName", "extDescription"]

let written = 0
for (const [code, dir] of Object.entries(CHROME_LOCALES)) {
  const source = JSON.parse(readFileSync(join(ROOT, "i18n", code + ".json"), "utf8"))
  const messages = {}
  for (const key of STORE_KEYS) messages[key] = { message: source[key] }

  mkdirSync(join(ROOT, "_locales", dir), { recursive: true })
  writeFileSync(
    join(ROOT, "_locales", dir, "messages.json"),
    JSON.stringify(messages, null, 2) + "\n"
  )
  written++
}

console.log("_locales собран:", written, "языков")
