// Отрисовка бейджей и индикатора. Вся графика берётся из svg/
globalThis.CCD = globalThis.CCD || {}

CCD.ui = {
  // Строка игрока: .cc-user-block-component. Первая на странице — соперник, вторая — своя.
  SELECTORS: {
    row: ".cc-user-block-component",
    username: ".cc-user-username-component"
  },
  ROLES: ["opponent", "self"],

  _svgCache: new Map(),

  async svg(name) {
    if (!this._svgCache.has(name)) {
      const url = chrome.runtime.getURL("svg/" + name + ".svg")
      this._svgCache.set(name, fetch(url).then((r) => r.text()))
    }
    return this._svgCache.get(name)
  },

  rows() {
    return [...document.querySelectorAll(this.SELECTORS.row)]
  },

  /** Строка игрока по роли */
  row(role) {
    return this.rows()[this.ROLES.indexOf(role)] || null
  },

  username(role) {
    const el = this.row(role)?.querySelector(this.SELECTORS.username)
    return el?.textContent?.trim() || ""
  },

  /** Наш элемент внутри строки, если уже вставлен */
  mounted(role) {
    return this.row(role)?.querySelector('[data-ccd-role="' + role + '"]') || null
  },

  clear(role) {
    document.querySelectorAll('[data-ccd-role="' + role + '"]').forEach((el) => el.remove())
  },

  /** Вставляем последним потомком строки — после всех служебных узлов Vue */
  mount(role, node, username) {
    const row = this.row(role)
    if (!row) return
    this.clear(role)
    node.dataset.ccdRole = role
    node.dataset.ccdUser = username
    row.appendChild(node)
  },

  async renderBadges(role, stats, username) {
    if (!stats.badges.length) {
      this.clear(role)
      return
    }

    const box = document.createElement("span")
    box.className = "ccd-badges"
    box.title = this.tooltip(stats)

    for (const badge of stats.badges) {
      const wrap = document.createElement("span")
      wrap.className = "ccd-badge"
      wrap.innerHTML = await this.svg("badge-" + badge)
      box.appendChild(wrap)
    }

    this.mount(role, box, username)
  },

  async renderIndicator(role, stats, username) {
    const box = document.createElement("span")
    box.className = "ccd-indicator"
    box.title = this.tooltip(stats)

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
    this.mount(role, box, username)
  },

  tooltip(stats) {
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

    return lines.join("\n")
  }
}
