const NUMBERS = [
  "windowHours",
  "luckyWinRate",
  "coldWinRate",
  "highAccuracy",
  "newAccountMonths",
  "minGames",
  "minAccuracyGames"
]
const FLAGS = ["showBadges", "showOwnIndicator"]

function localize() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n)
  }
  document.title = chrome.i18n.getMessage("popupTitle")
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

function collect() {
  const patch = {}
  for (const key of NUMBERS) patch[key] = Number(document.getElementById(key).value)
  for (const key of FLAGS) patch[key] = document.getElementById(key).checked
  patch.timeClasses = [...document.querySelectorAll("[data-class]")]
    .filter((box) => box.checked)
    .map((box) => box.dataset.class)
  return patch
}

async function save(patch = collect()) {
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

document.getElementById("save").addEventListener("click", () => save())
document.getElementById("reset").addEventListener("click", () => {
  apply(CCD.DEFAULTS)
  save(collect())
})
