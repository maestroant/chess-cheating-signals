/**
 * Экспорт собранной плитки в SVG со слоями — чтобы открыть в Figma и двигать элементы.
 *
 *   node release/promo/to-svg.mjs screenshot-1280x800-v1-overview
 *   node release/promo/to-svg.mjs            — все собранные .html
 *
 * Как устроено: headless Chrome снимает фон отдельной картинкой (его рисуют градиенты
 * и псевдоэлементы, в вектор они не переносятся), затем страница обмеряется в браузере —
 * позиция, шрифт и базовая линия каждого куска текста, каждой картинки и каждой иконки.
 * Из этих чисел собирается SVG: текст остаётся текстом, бейджи — векторными,
 * фон лежит нижним слоем.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/* ─── то, что выполняется внутри страницы ─── */
function measure() {
  const root = document.querySelector(".cover, .tile");
  const R0 = root.getBoundingClientRect();
  const N = (v) => Math.round(v * 100) / 100;
  const layers = [];

  // отношение подъёма шрифта к кеглю — меряем пробником, стоящим на базовой линии
  const ascents = {};
  function ascentRatio(family, weight) {
    const key = family + "|" + weight;
    if (ascents[key] != null) return ascents[key];
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;left:-9999px;top:0;font-size:100px;line-height:normal;font-family:" +
      family +
      ";font-weight:" +
      weight;
    box.textContent = "H";
    document.body.appendChild(box);
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    box.appendChild(probe);
    const range = document.createRange();
    range.setStart(box.firstChild, 0);
    range.setEnd(box.firstChild, 1);
    const rect = range.getClientRects()[0];
    const ratio = (probe.getBoundingClientRect().top - rect.top) / 100;
    box.remove();
    ascents[key] = ratio;
    return ratio;
  }

  const rgba = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const a = m.length > 3 ? parseFloat(m[3]) : 1;
    if (a === 0) return null;
    const hex = m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
    return { hex: "#" + hex, a };
  };
  const rel = (r) => ({ x: N(r.left - R0.left), y: N(r.top - R0.top), w: N(r.width), h: N(r.height) });
  const nameOf = (el) =>
    el.id ||
    (typeof el.className === "string" && el.className.trim().split(/\s+/)[0]) ||
    el.tagName.toLowerCase();

  function textRuns(el, node, cs, out) {
    const text = node.textContent;
    const range = document.createRange();
    const runs = [];
    let cur = null;
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rc = range.getClientRects()[0];
      const blank = /\s/.test(text[i]);
      if (!rc || (rc.width === 0 && rc.height === 0)) {
        cur = null;
        continue;
      }
      if (!cur) {
        if (blank) continue;
        cur = { text: text[i], top: rc.top, left: rc.left };
        runs.push(cur);
      } else if (Math.abs(rc.top - cur.top) < 0.5) {
        cur.text += text[i];
      } else {
        cur = blank ? null : { text: text[i], top: rc.top, left: rc.left };
        if (cur) runs.push(cur);
      }
    }
    const fs = parseFloat(cs.fontSize);
    const ratio = ascentRatio(cs.fontFamily, cs.fontWeight);
    const color = rgba(cs.color) || { hex: "#000000", a: 1 };
    runs.forEach((run, i) => {
      let t = run.text.replace(/\s+$/, "");
      // перенос строки и отступ из исходника браузер схлопывает в один пробел — в SVG тоже
      if (!cs.whiteSpace.startsWith("pre")) t = t.replace(/\s+/g, " ");
      if (!t.trim()) return;
      if (cs.textTransform === "uppercase") t = t.toUpperCase();
      out.push({
        type: "text",
        name: nameOf(el) + (runs.length > 1 ? "-" + (i + 1) : ""),
        x: N(run.left - R0.left),
        y: N(run.top - R0.top + ratio * fs),
        text: t,
        fill: color.hex,
        opacity: color.a,
        family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        size: N(fs),
        weight: cs.fontWeight,
        spacing: cs.letterSpacing === "normal" ? 0 : N(parseFloat(cs.letterSpacing)),
      });
    });
  }

  // картинку могло обрезать скруглённым родителем — переносим обрезку в SVG
  function clipOf(el) {
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow === "hidden" && parseFloat(cs.borderTopLeftRadius) > 0) {
        const r = rel(p.getBoundingClientRect());
        return Object.assign(r, { radius: N(parseFloat(cs.borderTopLeftRadius)) });
      }
    }
    return null;
  }

  function walk(el, out) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;

    // поворот выносим в группу: меряем элемент «выпрямленным», угол отдаём в SVG
    let target = out;
    let restore = null;
    if (cs.transform && cs.transform !== "none") {
      const m = new DOMMatrixReadOnly(cs.transform);
      if (Math.abs(m.b) > 1e-6) {
        const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
        const flat = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).multiply(
          new DOMMatrix().rotateSelf(-angle)
        );
        restore = el.style.transform;
        el.style.transform = flat.toString();
        const r = rel(el.getBoundingClientRect());
        const g = {
          type: "group",
          name: nameOf(el),
          angle: N(angle),
          cx: N(r.x + r.w / 2),
          cy: N(r.y + r.h / 2),
          children: [],
        };
        out.push(g);
        target = g.children;
      }
    }

    const r = rel(el.getBoundingClientRect());
    const tag = el.tagName.toLowerCase();

    if (tag === "img") {
      target.push(
        Object.assign({ type: "image", name: nameOf(el) }, r, {
          key: el.getAttribute("src").slice(0, 96),
          clip: clipOf(el),
        })
      );
    } else if (tag === "svg") {
      target.push(
        Object.assign({ type: "svg", name: el.getAttribute("aria-label") || nameOf(el) }, r, {
          vb: el.getAttribute("viewBox"),
          markup: el.innerHTML,
        })
      );
    } else {
      if (el !== root) {
        const bg = rgba(cs.backgroundColor);
        const bw = parseFloat(cs.borderTopWidth) || 0;
        const bc = bw > 0 ? rgba(cs.borderTopColor) : null;
        if (bg || bc) {
          target.push(
            Object.assign({ type: "rect", name: nameOf(el) }, r, {
              fill: bg ? bg.hex : "none",
              opacity: bg ? bg.a : 0,
              radius: N(parseFloat(cs.borderTopLeftRadius) || 0),
              stroke: bc ? bc.hex : null,
              strokeOpacity: bc ? bc.a : 0,
              strokeWidth: bw,
            })
          );
        }
      }
      for (const node of el.childNodes) if (node.nodeType === 3) textRuns(el, node, cs, target);
      for (const child of el.children) walk(child, target);
    }

    if (restore !== null) el.style.transform = restore;
  }

  walk(root, layers);
  return JSON.stringify({ width: N(R0.width), height: N(R0.height), layers });
}

/* ─── прогон страницы в headless Chrome ─── */
const chrome = (args) =>
  execFileSync(
    CHROME,
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", ...args],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
  );

const only = process.argv[2];
const pages = readdirSync(here)
  .filter((f) => f.endsWith(".html") && !f.endsWith(".src.html") && !f.startsWith("_"))
  .filter((f) => !only || f.includes(only));
if (!pages.length) throw new Error("нет собранных .html — сначала node build.mjs");

for (const page of pages) {
  const name = basename(page, ".html");
  const size = name.match(/(\d+)x(\d+)/);
  const html = readFileSync(join(here, page), "utf8");
  const work = mkdtempSync(join(tmpdir(), "ccs-svg-"));

  // 1) фон отдельной картинкой: прячем содержимое и снимаем скриншот
  const bgPage = join(work, "bg.html");
  writeFileSync(
    bgPage,
    html.replace(
      "</head>",
      "<style>.cover > *, .tile > * { visibility: hidden !important }</style></head>"
    )
  );
  chrome([
    "--window-size=" + size[1] + "," + size[2],
    "--virtual-time-budget=4000",
    "--screenshot=" + join(work, "bg.png"),
    pathToFileURL(bgPage).href,
  ]);
  const bg = "data:image/png;base64," + readFileSync(join(work, "bg.png")).toString("base64");

  // 2) обмер страницы
  const measurePage = join(work, "measure.html");
  const inject =
    "<script>document.fonts.ready.then(function () { var json = (" +
    measure.toString() +
    ")(); document.documentElement.innerHTML = '<body><pre id=OUT></pre></body>';" +
    " document.getElementById('OUT').textContent = json; });</script></body>";
  writeFileSync(measurePage, html.replace("</body>", inject));
  const dom = chrome([
    "--window-size=" + size[1] + "," + size[2],
    "--virtual-time-budget=6000",
    "--dump-dom",
    pathToFileURL(measurePage).href,
  ]).toString("utf8");
  const raw = dom.match(/<pre id="OUT">([\s\S]*?)<\/pre>/);
  if (!raw) throw new Error(name + ": страница не отдала обмер");
  const data = JSON.parse(
    raw[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  );

  // 3) картинки: сопоставляем по началу data-URL
  const srcs = [...html.matchAll(/src="?(data:[^"\s>]+)"?/g)].map((m) => m[1]);
  const findSrc = (key) => srcs.find((s) => s.startsWith(key.slice(0, 96))) || "";

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (o) =>
    Object.entries(o)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => k + '="' + v + '"')
      .join(" ");
  const defs = [];
  let clipId = 0;

  // Figma подставит свой Inter, а браузеру нужен шрифт внутри файла — кладём тот же woff2
  const font = html.match(/url\("(data:font\/woff2;base64,[^"]+)"\)/);
  if (font) {
    defs.push(
      '  <style>@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;' +
        'src:url("' + font[1] + '") format("woff2")}</style>'
    );
  }

  function render(layers, indent) {
    return layers
      .map((l) => {
        const id = ' id="' + esc(l.name) + '"';
        if (l.type === "group") {
          return (
            indent + "<g" + id + ' transform="rotate(' + l.angle + " " + l.cx + " " + l.cy + ')">\n' +
            render(l.children, indent + "  ") + "\n" + indent + "</g>"
          );
        }
        if (l.type === "rect") {
          return (
            indent + "<rect" + id + " " +
            attr({
              x: l.x, y: l.y, width: l.w, height: l.h,
              rx: l.radius || null,
              fill: l.fill,
              "fill-opacity": l.opacity < 1 ? l.opacity : null,
              stroke: l.stroke,
              "stroke-opacity": l.strokeOpacity < 1 ? l.strokeOpacity : null,
              "stroke-width": l.stroke ? l.strokeWidth : null,
            }) + " />"
          );
        }
        if (l.type === "image") {
          let clip = null;
          if (l.clip) {
            clip = "clip-" + ++clipId;
            defs.push(
              '  <clipPath id="' + clip + '"><rect x="' + l.clip.x + '" y="' + l.clip.y +
              '" width="' + l.clip.w + '" height="' + l.clip.h + '" rx="' + l.clip.radius + '" /></clipPath>'
            );
          }
          return (
            indent + "<image" + id + " " +
            attr({
              x: l.x, y: l.y, width: l.w, height: l.h,
              "clip-path": clip ? "url(#" + clip + ")" : null,
              preserveAspectRatio: "none",
              href: findSrc(l.key),
            }) + " />"
          );
        }
        if (l.type === "svg") {
          const vb = (l.vb || "0 0 1 1").split(/\s+/).map(Number);
          const sx = Math.round((l.w / vb[2]) * 1000) / 1000;
          const sy = Math.round((l.h / vb[3]) * 1000) / 1000;
          return (
            indent + "<g" + id + ' transform="translate(' + l.x + " " + l.y + ") scale(" + sx + " " + sy + ')">' +
            l.markup.trim() + "</g>"
          );
        }
        return (
          indent + "<text" + id + " " +
          attr({
            x: l.x, y: l.y,
            "font-family": l.family,
            "font-size": l.size,
            "font-weight": l.weight,
            "letter-spacing": l.spacing || null,
            fill: l.fill,
            "fill-opacity": l.opacity < 1 ? l.opacity : null,
            "xml:space": "preserve",
          }) + ">" + esc(l.text) + "</text>"
        );
      })
      .join("\n");
  }

  const body = render(data.layers, "  ");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + data.width + '" height="' + data.height +
    '" viewBox="0 0 ' + data.width + " " + data.height + '" fill="none">\n' +
    (defs.length ? "<defs>\n" + defs.join("\n") + "\n</defs>\n" : "") +
    '  <image id="background" x="0" y="0" width="' + data.width + '" height="' + data.height +
    '" preserveAspectRatio="none" href="' + bg + '" />\n' +
    body + "\n</svg>\n";

  const outDir = join(here, "..", "figma");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name + ".svg"), svg);
  console.log("✓ figma/" + name + ".svg  " + data.layers.length + " слоёв  " + (svg.length / 1024).toFixed(0) + " KB");
}
