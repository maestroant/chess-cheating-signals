// Сервис-воркер нужен ровно для одного: адреса, который Chrome откроет при удалении.
// В сам момент удаления расширения уже нет — ни спросить, ни отправить оттуда нечего,
// поэтому единственный способ услышать человека — заранее оставить ссылку.
const FEEDBACK_PAGE = "https://maestroant.github.io/chess-cheating-signals/uninstall.html"

/**
 * К адресу добавляем только язык и версию: язык — чтобы страница открылась на
 * понятном, версия — чтобы отзыв было с чем сопоставить. Ничего, что указывает
 * на человека, здесь нет и быть не должно: страница открывается сама, без спроса.
 */
function feedbackUrl() {
  const url = new URL(FEEDBACK_PAGE)
  url.searchParams.set("v", chrome.runtime.getManifest().version)
  url.searchParams.set("lang", chrome.i18n.getUILanguage())
  return url.toString()
}

// Воркер засыпает и просыпается когда хочет, поэтому ставим адрес при каждом старте:
// вызов идемпотентный, а пропущенный оставил бы удаление немым
chrome.runtime.setUninstallURL(feedbackUrl())
