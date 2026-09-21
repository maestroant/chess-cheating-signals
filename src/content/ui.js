// Отрисовка бейджей и индикатора. Вся графика берётся из svg/
globalThis.CCD = globalThis.CCD || {}

CCD.ui = {
  SELECTORS: {
    // Доска: строка игрока. Первая на странице — соперник, вторая — своя.
    row: ".cc-user-block-component",
    username: ".cc-user-username-component",
    // Профиль: шапка с ником и uuid в data-атрибутах
    profileHeader: ".profile-header-container, [data-username][data-user-uuid]"
  },

  _svgCache: new Map(),
  // какие бейджи уже мигали: ник + бейдж. Vue часто перерисовывает строку,
  // и без этого бейдж моргал бы заново при каждой перевставке
  _blinked: new Set(),

  // Шрифт макета (Inter) вставляется из JS, а не из badges.css: путь строится через
  // chrome.runtime.getURL и не зависит от того, как браузер резолвит относительные ссылки.
  // Подмножества Inter: латиница для бейджей, кириллица для текста подсказки.
  // unicode-range обязателен — иначе браузер возьмёт только последний файл.
  FONT_FACES: [
    [
      "fonts/inter-latin.woff2",
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308," +
        "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
    ],
    ["fonts/inter-cyrillic.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"]
  ],

  ensureFont() {
    if (document.getElementById("ccd-font")) return

    const style = document.createElement("style")
    style.id = "ccd-font"
    style.textContent = this.FONT_FACES.map(
      ([file, range]) =>
        '@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;' +
        'font-display:swap;src:url("' + chrome.runtime.getURL(file) + '") format("woff2");' +
        "unicode-range:" + range + ";}"
    ).join("")
    ;(document.head || document.documentElement).appendChild(style)
  },

  async svg(name) {
    const cached = this._svgCache.get(name)
    if (cached) return cached

    const url = chrome.runtime.getURL("svg/" + name + ".svg")
    const promise = fetch(url).then((r) => {
      if (!r.ok) throw new Error("svg " + name + ": HTTP " + r.status)
      return r.text()
    })

    // неудачу не кэшируем: иначе одна осечка при перезагрузке расширения
    // навсегда оставила бы страницу без бейджей
    promise.catch(() => this._svgCache.delete(name))
    this._svgCache.set(name, promise)
    return promise
  },

  isProfilePage() {
    return location.pathname.startsWith("/member/")
  },

  /**
   * Куда и что рисовать на текущей странице.
   * @returns {{role:string, username:string, anchor:Element, kind:string}[]}
   */
  targets() {
    return this.isProfilePage() ? this._profileTargets() : this._boardTargets()
  },

  _boardTargets() {
    const roles = ["opponent", "self"]
    const out = []

    this.rows().slice(0, 2).forEach((row, i) => {
      const username = row.querySelector(this.SELECTORS.username)?.textContent?.trim()
      if (!username) return
      out.push({
        role: roles[i],
        username,
        anchor: row, // вставляем последним потомком строки
        kind: roles[i] === "self" ? "indicator" : "badges"
      })
    })

    return out
  },

  _profileTargets() {
    const header = document.querySelector(this.SELECTORS.profileHeader)
    const username = header?.getAttribute("data-username")
    if (!header || !username) return []

    return [{ role: "profile", username, anchor: this._profileAnchor(header, username), kind: "badges" }]
  },

  /**
   * Элемент рядом с ником в шапке профиля. Классы chess.com тут не используем:
   * ищем лист дерева, текст которого — ровно ник, и цепляемся к его родителю.
   */
  _profileAnchor(header, username) {
    const lower = username.toLowerCase()
    const leaf = [...header.querySelectorAll("*")].find(
      (el) => !el.children.length && el.textContent.trim().toLowerCase() === lower
    )
    return leaf?.parentElement || header
  },

  rows() {
    return [...document.querySelectorAll(this.SELECTORS.row)]
  },

  /**
   * Строки игроков как их видит расширение — для консоли. Роль здесь считается
   * так же, как в _boardTargets(): по порядку в DOM. Если строк не две, видно сразу,
   * какая лишняя и чей ник уехал в чужую роль.
   */
  dumpRows() {
    const rows = this.rows()
    console.log("[CCD] строк .cc-user-block-component:", rows.length)

    rows.forEach((row, i) => {
      const box = row.getBoundingClientRect()
      console.log(
        "[CCD]   #" + i,
        i < 2 ? "→ " + ["opponent", "self"][i] : "→ не учитывается (берём только первые две)",
        "ник:", row.querySelector(this.SELECTORS.username)?.textContent?.trim() || "НЕТ",
        "| размер:", Math.round(box.width) + "x" + Math.round(box.height),
        "| сверху:", Math.round(box.top),
        "| наш узел:", row.querySelector("[data-ccd-role]")?.dataset.ccdRole || "нет"
      )
    })
  },

  /** Наш элемент для роли, если уже вставлен */
  mounted(role) {
    return document.querySelector('[data-ccd-role="' + role + '"]')
  },

  clear(role) {
    document.querySelectorAll('[data-ccd-role="' + role + '"]').forEach((el) => el.remove())
  },

  /**
   * Якорь мы взяли до запросов к chess.com, а они идут секундами: Vue успевает
   * перерисовать строку, и тот div уже не на странице. Вставка в него проходит
   * без ошибок, но на экране ничего нет — узел уехал в отсоединённое поддерево.
   * Поэтому берём строку заново; её может не оказаться вовсе — тогда false.
   */
  mount(target, node) {
    const anchor = target.anchor.isConnected
      ? target.anchor
      : this.targets().find((t) => t.role === target.role && t.username === target.username)?.anchor

    if (!anchor) return false
    if (anchor !== target.anchor) {
      console.warn("[CCD] " + target.role + " " + target.username + ": строку перерисовали, вставляем в новую")
    }

    this.clear(target.role)
    node.dataset.ccdRole = target.role
    node.dataset.ccdUser = target.username
    anchor.appendChild(node)
    return true
  },

  /**
   * Что показываем: индикатор со счётом и бейджи — каждое включается отдельно.
   * Бейджи бывают только у соперника и в профиле. Нечего показать — убираем всё.
   */
  async render(target, stats, settings) {
    this.ensureFont()

    const own = target.kind === "indicator"
    const withIndicator = own ? settings.showOwnIndicator : settings.showOpponentIndicator
    const badges = own ? [] : stats.badges

    if (!stats.total || (!withIndicator && !badges.length)) {
      console.log(
        "[CCD] " + target.role + " " + target.username + ": нечего рисовать —",
        !stats.total ? "нет партий в окне" : "индикатор и бейджи выключены"
      )
      this.clear(target.role)
      return
    }

    const box = document.createElement("span")
    box.className = "ccd-card"
    this.attachTooltip(box, this.tooltip(stats, settings))

    if (withIndicator) box.appendChild(await this.indicatorNode(stats))

    for (const badge of badges) {
      const key = target.username + ":" + badge
      const first = !this._blinked.has(key)
      this._blinked.add(key)
      box.appendChild(await this.badgeNode(badge, first))
    }

    if (!this.mount(target, box)) {
      console.warn("[CCD] " + target.role + " " + target.username + ": строка исчезла со страницы, рисовать некуда")
      return
    }

    console.log(
      "[CCD] " + target.role + " " + target.username + ": нарисовано —",
      withIndicator ? "индикатор" : "без индикатора",
      "| бейджи:", badges.join(",") || "нет",
      "| видно:", box.getBoundingClientRect().width > 0
    )
  },

  async badgeNode(badge, blink) {
    const wrap = document.createElement("span")
    wrap.className = blink ? "ccd-badge ccd-blink" : "ccd-badge"
    wrap.innerHTML = await this.svg("badge-" + badge)
    return wrap
  },

  async indicatorNode(stats) {
    const box = document.createElement("span")
    box.className = "ccd-indicator"

    const bar = document.createElement("span")
    bar.className = "ccd-indicator-bar"
    bar.innerHTML = await this.svg("indicator")

    const decisive = stats.wld.win + stats.wld.loss
    const share = decisive ? stats.wld.win / decisive : 0
    bar.querySelector("#ccd-wins")?.setAttribute("width", String(33 * share))

    const score = document.createElement("span")
    score.className = "ccd-score"
    score.innerHTML =
      '<span class="ccd-win">' + stats.wld.win + "</span>" +
      '<span class="ccd-sep">:</span>' +
      '<span class="ccd-loss">' + stats.wld.loss + "</span>"

    box.append(bar, score)
    return box
  },

  TOOLTIP_DELAY: 250,
  TOOLTIP_GAP: 6,

  /**
   * Один общий узел на страницу. Внутренний div несёт классы подсказки самого chess.com
   * (`cc-tooltip-component` / `cc-tooltip-inner`), поэтому внешний вид берётся из темы сайта.
   * Позиционируем сами: у сайта это делает Popover API с их собственной геометрией.
   */
  tooltipNode() {
    let node = document.getElementById("ccd-tooltip")

    if (!node) {
      node = document.createElement("div")
      node.id = "ccd-tooltip"
      node.className = "cc-tooltip-component ccd-tooltip"
      node.hidden = true

      const inner = document.createElement("div")
      // cc-text-medium-bold — типографский класс сайта, из него приходят размер и насыщенность
      inner.className = "cc-tooltip-inner cc-text-medium-bold ccd-tooltip-inner"
      node.appendChild(inner)
      document.body.appendChild(node)
    }

    // тему сайт переключает классом; у их подсказки он стоит на самом компоненте
    const dark = !document.documentElement.classList.contains("light-mode") &&
      !document.body.classList.contains("light-mode")
    node.classList.toggle("dark-mode", dark)
    node.classList.toggle("light-mode", !dark)

    // язык и направление письма нашей подсказки не обязаны совпадать со страницей
    node.lang = CCD.i18n.lang
    node.dir = CCD.i18n.isRtl() ? "rtl" : "ltr"

    return node
  },

  hideTooltip() {
    clearTimeout(this._tooltipTimer)
    const node = document.getElementById("ccd-tooltip")
    if (node) node.hidden = true
  },

  attachTooltip(el, text) {
    el.addEventListener("mouseenter", () => {
      clearTimeout(this._tooltipTimer)
      this._tooltipTimer = setTimeout(() => this.showTooltip(el, text), this.TOOLTIP_DELAY)
    })
    el.addEventListener("mouseleave", () => this.hideTooltip())

    // один раз на страницу: при прокрутке подсказка уехала бы от якоря
    if (!this._scrollBound) {
      this._scrollBound = true
      window.addEventListener("scroll", () => this.hideTooltip(), { passive: true })
    }
  },

  showTooltip(el, text) {
    if (!el.isConnected) return

    const node = this.tooltipNode()
    node.querySelector(".ccd-tooltip-inner").innerHTML = text
    node.hidden = false

    const anchor = el.getBoundingClientRect()
    const size = node.getBoundingClientRect()
    const below = anchor.bottom + this.TOOLTIP_GAP
    const fitsBelow = below + size.height <= window.innerHeight

    node.style.top = (fitsBelow ? below : anchor.top - size.height - this.TOOLTIP_GAP) + "px"
    node.style.left =
      Math.max(4, Math.min(anchor.left, window.innerWidth - size.width - 4)) + "px"
  },

  /** Порог, при котором сработал бейдж — подставляется в расшифровку */
  BADGE_THRESHOLDS: {
    lucky: "luckyWinRate",
    cold: "coldWinRate",
    high: "highAccuracy",
    new: "newAccountMonths"
  },

  /** Расшифровка бейджей: что означает каждый из показанных */
  badgeLines(stats, settings) {
    return stats.badges.map((badge) => {
      const key = "badge" + badge[0].toUpperCase() + badge.slice(1)
      const threshold = settings?.[this.BADGE_THRESHOLDS[badge]]
      return CCD.i18n.t(key, String(threshold ?? ""))
    })
  },

  ESCAPES: { "&": "&amp;", "<": "&lt;", ">": "&gt;" },

  /** Собираем HTML: числа побед и поражений красим, остальное экранируем */
  tooltip(stats, settings) {
    const esc = (text) => String(text).replace(/[&<>]/g, (c) => this.ESCAPES[c])
    const num = (value, cls, suffix = "") =>
      '<span class="' + cls + '">' + Number(value) + suffix + "</span>"

    const lines = [
      // подстановки уходят разметкой, поэтому строку не экранируем: и шаблон, и числа наши
      CCD.i18n.t(
        "tooltipRecord",
        num(stats.wld.win, "ccd-t-win"),
        num(stats.wld.loss, "ccd-t-loss"),
        String(Number(stats.wld.draw))
      )
    ]

    lines.push(
      stats.accuracy === null
        ? esc(CCD.i18n.t("tooltipNoAccuracy"))
        : CCD.i18n.t(
            "tooltipAccuracy",
            num(Math.round(stats.accuracy), "ccd-t-rate", "%"),
            String(Number(stats.accGames)),
            String(Number(stats.total))
          )
    )

    if (stats.opening) {
      // название приходит из API, поэтому экранируем его, а не строку целиком
      lines.push(
        CCD.i18n.t(
          "tooltipOpening",
          '<span class="ccd-t-opening">' + esc(stats.opening) + "</span>"
        )
      )
    }

    if (stats.device) {
      lines.push(esc(CCD.i18n.t(stats.device === "phone" ? "devicePhone" : "devicePc")))
    }

    // расшифровка идёт первой: она объясняет, почему бейдж вообще появился
    const explain = stats.badges.length ? this.badgeLines(stats, settings).map(esc) : []
    return [...explain, ...(explain.length ? [""] : []), ...lines].join("\n")
  }
}
