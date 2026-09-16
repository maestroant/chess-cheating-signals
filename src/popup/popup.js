const NUMBERS = [
  "windowHours",
  "luckyWinRate",
  "coldWinRate",
  "highAccuracy",
  "newAccountMonths",
  "minGames",
  "minAccuracyGames"
]
const FLAGS = ["showLucky", "showCold", "showHigh", "showNew", "showOwnIndicator"]

function localize() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n)
  }
  document.title = chrome.i18n.getMessage("popupTitle")
}

async function load() {
  const s = await chrome.storage.sync.get(CCD.DEFAULTS)
  const settings = { ...CCD.DEFAULTS, ...s }

  for (const key of NUMBERS) document.getElementById(key).value = settings[key]
  for (const key of FLAGS) document.getElementById(key).checked = settings[key]
  for (const box of document.querySelectorAll("[data-class]")) {
    box.checked = settings.timeClasses.includes(box.dataset.class)
  }
}

async function save() {
  const patch = {}
  for (const key of NUMBERS) patch[key] = Number(document.getElementById(key).value)
  for (const key of FLAGS) patch[key] = document.getElementById(key).checked
  patch.timeClasses = [...document.querySelectorAll("[data-class]")]
    .filter((box) => box.checked)
    .map((box) => box.dataset.class)

  await chrome.storage.sync.set(patch)

  const status = document.getElementById("status")
  status.textContent = chrome.i18n.getMessage("statusSaved")
  setTimeout(() => (status.textContent = ""), 1500)

  const tabs = await chrome.tabs.query({ url: "https://*.chess.com/*" })
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: "settings-updated" }).catch(() => {})
  }
}

localize()
load()
document.getElementById("save").addEventListener("click", save)
