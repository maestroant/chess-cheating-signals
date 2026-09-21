const NUMBERS = [
  "windowHours",
  "luckyWinRate",
  "coldWinRate",
  "highAccuracy",
  "newAccountMonths",
  "minGames",
  "minAccuracyGames"
]
const FLAGS = ["showBadges", "showOpponentIndicator", "showOwnIndicator"]

/**
 * Попап — часть браузера, а не страницы, поэтому говорит на языке браузера.
 * На самой странице язык берётся другой — тот, что стоит в интерфейсе chess.com.
 */
function browserLanguage() {
  const ui = chrome.i18n?.getUILanguage?.() || navigator.language
  return CCD.locale.resolve(ui)
}

async function localize(lang) {
  await CCD.i18n.use(lang)

  document.documentElement.lang = lang
  document.documentElement.dir = CCD.i18n.isRtl(lang) ? "rtl" : "ltr"

  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = CCD.i18n.t(el.dataset.i18n)
  }
  document.title = CCD.i18n.t("popupTitle")
}

function apply(settings) {
  for (const key of NUMBERS) document.getElementById(key).value = settings[key]
  for (const key of FLAGS) document.getElementById(key).checked = settings[key]
  for (const box of document.querySelectorAll("[data-class]")) {
    box.checked = settings.timeClasses.includes(box.dataset.class)
  }
}

async function load() {
  const stored = await chrome.storage.sync.get(CCD.DEFAULTS)
  apply({ ...CCD.DEFAULTS, ...stored })
}

/**
 * LUCKY срабатывает выше своего порога, COLD — ниже своего.
 * Если порог COLD оказался выше порога LUCKY, существует процент побед,
 * попадающий под оба условия сразу. Не даём такому случиться:
 * правим соседнее поле, а не то, которое человек только что заполнил.
 */
function syncWinRates(edited) {
  const lucky = document.getElementById("luckyWinRate")
  const cold = document.getElementById("coldWinRate")
  if (lucky.value === "" || cold.value === "") return

  const l = Number(lucky.value)
  const c = Number(cold.value)
  if (!Number.isFinite(l) || !Number.isFinite(c) || c <= l) return

  if (edited === "lucky") cold.value = String(l)
  else lucky.value = String(c)
}

function collect() {
  syncWinRates("lucky")

  const patch = {}
  for (const key of NUMBERS) {
    // пустое или нечисловое поле — возвращаем значение по умолчанию, а не ноль
    const value = Number(document.getElementById(key).value)
    patch[key] = Number.isFinite(value) && document.getElementById(key).value !== ""
      ? value
      : CCD.DEFAULTS[key]
  }
  for (const key of FLAGS) patch[key] = document.getElementById(key).checked
  // последняя страховка: пустое поле могло подставить значение по умолчанию
  // и снова развести пороги в пересечение
  patch.coldWinRate = Math.min(patch.coldWinRate, patch.luckyWinRate)

  patch.timeClasses = [...document.querySelectorAll("[data-class]")]
    .filter((box) => box.checked)
    .map((box) => box.dataset.class)
  return patch
}

async function save(patch = collect()) {
  await chrome.storage.sync.set(patch)
  flash("statusSaved")

  const tabs = await chrome.tabs.query({ url: "https://*.chess.com/*" })
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: "settings-updated" }).catch(() => {})
  }
}

const SUPPORT_EMAIL = "support@fbextractor.com"

let flashTimer = null

/**
 * Короткое сообщение в общей строке состояния. Раньше подтверждение о копировании
 * писалось в саму ссылку, но теперь там значок, а не текст: textContent стёр бы его.
 */
function flash(key) {
  const status = document.getElementById("status")
  status.textContent = CCD.i18n.t(key)
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (status.textContent = ""), 1500)
}

/** Запасной путь, когда вкладку открыть не удалось: адрес хотя бы окажется в буфере */
async function copyEmail() {
  try {
    await navigator.clipboard.writeText(SUPPORT_EMAIL)
  } catch {
    // clipboard API может быть недоступен, если попап потерял фокус — старый путь работает всегда
    const area = document.createElement("textarea")
    area.value = SUPPORT_EMAIL
    document.body.append(area)
    area.select()
    document.execCommand("copy")
    area.remove()
  }

  flash("statusCopied")
}

/**
 * Chrome не выполняет переход по mailto: из попапа, поэтому адрес открывается
 * вкладкой — на самом переходе его подхватывает почтовый клиент.
 *
 * Пустую вкладку после передачи протокола Chrome закрывает сам. Прибрать её из
 * попапа всё равно нельзя: открытие вкладки закрывает попап, а вместе с ним
 * умирает и весь его JS, включая отложенные таймеры.
 */
async function openMail() {
  try {
    await chrome.tabs.create({ url: "mailto:" + SUPPORT_EMAIL })
  } catch {
    await copyEmail()
  }
}

async function init() {
  await localize(browserLanguage())
  await load()

  document.getElementById("luckyWinRate").addEventListener("change", () => syncWinRates("lucky"))
  document.getElementById("coldWinRate").addEventListener("change", () => syncWinRates("cold"))

  document.getElementById("contact").addEventListener("click", (event) => {
    // переход по ссылке из попапа всё равно не состоится — открываем вкладкой сами
    event.preventDefault()
    openMail()
  })

  document.getElementById("save").addEventListener("click", () => save())
  document.getElementById("reset").addEventListener("click", () => {
    apply(CCD.DEFAULTS)
    save(collect())
  })
}

init()
