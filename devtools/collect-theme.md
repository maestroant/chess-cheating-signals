# Как снять стили подсказки с самой chess.com

Оба сниппета — в консоли на любой странице chess.com (F12 → Console).
Результат кладётся в буфер обмена через `copy(...)`, вставь в файл рядом.

## 1. Токены темы → `devtools/theme-tokens.json`

Забирает все CSS-переменные, объявленные сайтом на `:root` / `html` / `body`.
Из них я выберу те, что отвечают за фон и текст подсказки, — тогда наш тултип
сам подстроится под светлую и тёмную тему.

```js
const out = {}
for (const sheet of document.styleSheets) {
  let rules
  try { rules = sheet.cssRules } catch { continue }   // чужие домены пропускаем
  for (const rule of rules) {
    const sel = rule.selectorText || ""
    if (!rule.style || !/(^|,)\s*(:root|html|body)\b/.test(sel)) continue
    for (const prop of rule.style) {
      if (prop.startsWith("--")) out[prop] = rule.style.getPropertyValue(prop).trim()
    }
  }
}
console.log("переменных:", Object.keys(out).length)
copy(JSON.stringify(out, null, 1))
```

Если удобнее — сделай это дважды: в тёмной теме и в светлой, и сохрани два файла
(`theme-tokens-dark.json`, `theme-tokens-light.json`). Так будет видно, какие токены
реально меняются при переключении.

## 2. Настоящая подсказка chess.com → `devtools/native-tooltip.json`

Классы на самой кнопке (`cc-icon-button-component`, `cc-bg-ghost`, `favorite-game-toggle-component`)
стилизуют кнопку, а не подсказку. Сама подсказка — это либо отдельный узел, который сайт
создаёт в момент наведения, либо псевдоэлемент. Снипет ниже проверяет оба варианта сразу.

Вставь в консоль, нажми Enter, **затем 10 секунд води курсором по кнопке** — результат
уйдёт в буфер сам.

```js
(() => {
  const found = []
  const props = ["background-color", "color", "border", "border-radius", "padding",
    "font-family", "font-size", "font-weight", "line-height", "box-shadow", "max-width", "z-index"]
  const styles = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo)
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]))
  }

  // вариант А: псевдоэлемент или обычный title на кнопке
  const btn = document.querySelector(".favorite-game-toggle-component")
  if (btn) {
    if (btn.title) found.push({ how: "атрибут title", value: btn.title })
    for (const pseudo of ["::after", "::before"]) {
      const content = getComputedStyle(btn, pseudo).content
      if (content && content !== "none") {
        found.push({ how: "псевдоэлемент " + pseudo, content, styles: styles(btn, pseudo) })
      }
    }
  } else {
    console.warn("кнопка не найдена — открой страницу с ней")
  }

  // вариант Б: отдельный узел, появляющийся при наведении
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        const mark = String(n.className || "") + " " + (n.getAttribute("role") || "")
        if (!/tooltip|popover|hint|tip/i.test(mark)) continue
        found.push({
          how: "появился при наведении",
          tag: n.tagName,
          classes: String(n.className || ""),
          html: n.outerHTML.slice(0, 1500),
          styles: styles(n, null)
        })
      }
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  console.log("Води курсором по кнопке. Через 10 секунд результат будет в буфере.")
  setTimeout(() => {
    obs.disconnect()
    console.log(found)
    try { copy(JSON.stringify(found, null, 1)) } catch (e) {}
    console.log(found.length ? "поймано вариантов: " + found.length : "ничего не поймал")
  }, 10000)
})()
```

Если ничего не поймалось — значит подсказку рисует что-то нестандартное. Тогда: наведи курсор,
в Elements включи «Freeze DOM» (правый клик по `<body>` → Break on → subtree modifications,
или просто F8 при открытом Sources) и найди новый узел глазами, скопируй его `outerHTML`.

Что мне это даст: точные скругление, отступы, тень, размер шрифта и, главное, **имена
CSS-переменных**, которыми сайт красит свою подсказку — их я и подставлю вместо догадок.
