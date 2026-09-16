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
    if (!this._svgCache.has(name)) {
      const url = chrome.runtime.getURL("svg/" + name + ".svg")
      this._svgCache.set(name, fetch(url).then((r) => r.text()))
    }
    return this._svgCache.get(name)
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

  /** Наш элемент для роли, если уже вставлен */
  mounted(role) {
    return document.querySelector('[data-ccd-role="' + role + '"]')
  },

  clear(role) {
    document.querySelectorAll('[data-ccd-role="' + role + '"]').forEach((el) => el.remove())
  },

  mount(target, node) {
    this.clear(target.role)
    node.dataset.ccdRole = target.role
    node.dataset.ccdUser = target.username
    target.anchor.appendChild(node)
  },

  /**
   * kind === "indicator" (своя карточка) — всегда счёт побед/поражений.
   * kind === "badges" (соперник, профиль) — бейдж, а если повода для бейджа нет, тот же счёт.
   * Партий в окне нет — не показываем ничего.
   */
  async render(target, stats, settings) {
    this.ensureFont()

    if (!stats.total) {
      this.clear(target.role)
      return
    }
    if (target.kind === "badges" && stats.badges.length) {
      return this.renderBadges(target, stats, settings)
    }
    return this.renderIndicator(target, stats)
  },

  async renderBadges(target, stats, settings) {
    const box = document.createElement("span")
    box.className = "ccd-badges"
    this.attachTooltip(box, this.tooltip(stats, settings))

    for (const badge of stats.badges) {
      const wrap = document.createElement("span")
      wrap.className = "ccd-badge"
      wrap.innerHTML = await this.svg("badge-" + badge)
      box.appendChild(wrap)
    }

    this.mount(target, box)
  },

  async renderIndicator(target, stats) {
    const box = document.createElement("span")
    box.className = "ccd-indicator"
    this.attachTooltip(box, this.tooltip(stats))

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
    this.mount(target, box)
  },

  TOOLTIP_DELAY: 250,
  TOOLTIP_GAP: 6,

  /** Один общий узел на страницу, а не по одному на каждый бейдж */
  tooltipNode() {
    let node = document.getElementById("ccd-tooltip")
    if (!node) {
      node = document.createElement("div")
      node.id = "ccd-tooltip"
      node.className = "ccd-tooltip"
      node.hidden = true
      document.body.appendChild(node)
    }
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
    node.textContent = text
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
      return chrome.i18n.getMessage(key, String(threshold ?? ""))
    })
  },

  tooltip(stats, settings) {
    const lines = [
      chrome.i18n.getMessage("tooltipRecord", [
        String(stats.wld.win),
        String(stats.wld.loss),
        String(stats.wld.draw)
      ]),
      chrome.i18n.getMessage("tooltipWinRate", String(Math.round(stats.winRate)))
    ]

    lines.push(
      stats.accuracy === null
        ? chrome.i18n.getMessage("tooltipNoAccuracy")
        : chrome.i18n.getMessage("tooltipAccuracy", [
            String(Math.round(stats.accuracy)),
            String(stats.accGames),
            String(stats.total)
          ])
    )

    if (stats.device) {
      lines.push(chrome.i18n.getMessage(stats.device === "phone" ? "devicePhone" : "devicePc"))
    }
    if (stats.source === "public") lines.push(chrome.i18n.getMessage("sourceFallback"))

    // расшифровка идёт первой: она объясняет, почему бейдж вообще появился
    const explain = stats.badges.length ? this.badgeLines(stats, settings) : []
    return [...explain, ...(explain.length ? [""] : []), ...lines].join("\n")
  }
}
