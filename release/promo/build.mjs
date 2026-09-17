/**
 * Собирает промо-плитки для Chrome Web Store из *.src.html:
 * встраивает шрифт и логотип в data: URL и снимает PNG через headless Chrome.
 *
 *   node release/promo/build.mjs            — собрать всё
 *   node release/promo/build.mjs v3        — только варианты, в имени которых есть "v3"
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, copyFileSync } from "node:fs";
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

  let html = readFileSync(join(here, src), "utf8");
  // сперва партиалы ({{FILE:_tile.css}}), потом ассеты — в партиалах свои токены
  html = html.replace(/\{\{FILE:([\w.\-\/]+)\}\}/g, (_, f) => readFileSync(join(here, f), "utf8"));
  for (const [token, value] of Object.entries(SUBST)) html = html.split(token).join(value);

  // Chrome снимает скриншот только с файла в своей рабочей папке — отдаём ему временную копию
  const work = mkdtempSync(join(tmpdir(), "ccs-promo-"));
  const page = join(work, `${name}.html`);
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
      `--screenshot=${join(work, `${name}.png`)}`,
      pathToFileURL(page).href,
    ],
    { stdio: "pipe" }
  );

  // скриншоты карточки живут в release/screenshots, промо — рядом с исходником
  const outDir = name.startsWith("screenshot-") ? join(here, "..", "screenshots") : here;
  copyFileSync(join(work, `${name}.png`), join(outDir, `${name}.png`));
  writeFileSync(join(here, `${name}.html`), html); // самодостаточная копия для правок вручную
  console.log(`✓ ${name}.png  ${w}×${h}`);
}
