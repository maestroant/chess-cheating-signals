/**
 * Собирает промо-плитки для Chrome Web Store из *.src.html:
 * встраивает шрифт и логотип в data: URL и снимает PNG через headless Chrome.
 *
 *   node release/promo/build.mjs            — собрать всё
 *   node release/promo/build.mjs v3        — только варианты, в имени которых есть "v3"
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
].find((p) => {
  try {
    readFileSync(p, { flag: "r" });
    return true;
  } catch {
    return false;
  }
});
if (!CHROME) throw new Error("Chrome не найден — укажите путь вручную в build.mjs");

const dataUrl = (file, mime) => `"data:${mime};base64,${readFileSync(join(root, file)).toString("base64")}"`;

const SUBST = {
  "{{FONT_LATIN}}": dataUrl("fonts/inter-latin.woff2", "font/woff2"),
  "{{FONT_CYRILLIC}}": dataUrl("fonts/inter-cyrillic.woff2", "font/woff2"),
  "{{LOGO}}": dataUrl("docs/assets/logo-256.png", "image/png"),
  "{{LOGO_BIG}}": dataUrl("release/img/logo.png", "image/png"),
  "{{BOARD}}": dataUrl("docs/assets/board.png", "image/png"),
};

/* ─── локализация: {{T:ключ}} из strings.json, {{I18N:ключ|аргументы}} из i18n расширения ─── */
const STRINGS = JSON.parse(readFileSync(join(here, "strings.json"), "utf8"));
const LOCALES = Object.keys(STRINGS).filter((k) => k !== "_");
const i18nCache = {};
const i18nOf = (loc) => {
  if (!i18nCache[loc]) {
    // _locales пишет pt_BR, папка i18n — pt-BR
    const file = join(root, "i18n", loc.replace("_", "-") + ".json");
    i18nCache[loc] = JSON.parse(readFileSync(file, "utf8"));
  }
  return i18nCache[loc];
};

function localize(html, loc) {
  const dict = STRINGS[loc] || STRINGS.en;
  const strings = i18nOf(loc);
  const fallback = i18nOf("en");
  return html
    .split("{{LOCALE}}").join(loc)
    .replace(/\{\{T:(\w+)\}\}/g, (_, key) => dict[key] ?? STRINGS.en[key] ?? "")
    .replace(/\{\{I18N:([^}]+)\}\}/g, (_, expr) => {
      const [key, ...args] = expr.split("|");
      const template = strings[key] ?? fallback[key] ?? "";
      return template.replace(/\$(\d)/g, (m, i) => args[Number(i) - 1] ?? m);
    });
}

const only = process.argv[2];
const sources = readdirSync(here)
  .filter((f) => f.endsWith(".src.html") && !f.startsWith("_"))
  .filter((f) => !only || f.includes(only));
if (!sources.length) throw new Error(`нет .src.html${only ? ` по маске ${only}` : ""}`);

for (const src of sources) {
  const name = basename(src, ".src.html");
  const size = name.match(/(\d+)x(\d+)/);
  if (!size) throw new Error(`${src}: в имени файла нет размера вида 440x280`);
  const [, w, h] = size;

  let base = readFileSync(join(here, src), "utf8");
  // сперва партиалы ({{FILE:_tile.css}}), потом ассеты — в партиалах свои токены
  base = base.replace(/\{\{FILE:([\w.\-\/]+)\}\}/g, (_, f) => readFileSync(join(here, f), "utf8"));
  for (const [token, value] of Object.entries(SUBST)) base = base.split(token).join(value);

  // <!-- l10n --> в исходнике = собирать на все локали из strings.json
  const locales = base.includes("<!-- l10n -->") ? LOCALES : ["en"];
  for (const loc of locales) {
  const html = localize(base, loc);

  // Chrome снимает скриншот только с файла в своей рабочей папке — отдаём ему временную копию
  const work = mkdtempSync(join(tmpdir(), "ccs-promo-"));
  const out = name + (loc === "en" ? "" : "-" + loc);
  const page = join(work, `${out}.html`);
  writeFileSync(page, html);

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${w},${h}`,
      "--virtual-time-budget=4000",
      `--screenshot=${join(work, `${out}.png`)}`,
      pathToFileURL(page).href,
    ],
    { stdio: "pipe" }
  );

  // скриншоты карточки живут в release/screenshots/<локаль>, промо — рядом с исходником
  const outDir = name.startsWith("screenshot-") ? join(here, "..", "screenshots", loc) : here;
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(work, `${out}.png`), join(outDir, `${name}.png`));
  writeFileSync(join(here, `${out}.html`), html); // самодостаточная копия для правок вручную
  console.log(`✓ ${outDir.split(/[\/]/).slice(-1)[0]}/${name}.png  ${w}×${h}  [${loc}]`);
  }
}
