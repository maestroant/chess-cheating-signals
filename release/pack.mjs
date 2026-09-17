/**
 * Собирает zip для загрузки в Chrome Web Store: только то, что читает расширение.
 *
 *   node release/pack.mjs   ->  release/chess-cheating-signals-<version>.zip
 */
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// всё, что уезжает в стор; лендинг, релизные материалы и служебные папки остаются снаружи
const INCLUDE = ["manifest.json", "_locales", "src", "icons", "svg", "fonts", "i18n"];
// в svg/ лежат ещё и исходники из Figma — в пакет они не нужны, а web_accessible_resources
// отдаёт svg/*.svg целиком, так что иначе они уедут в стор вместе с бейджами
const SHIP_SVG = ["badge-cold", "badge-high", "badge-lucky", "badge-new", "indicator"].map((n) => `${n}.svg`);

const { version } = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const zip = join(here, `chess-cheating-signals-${version}.zip`);
if (existsSync(zip)) rmSync(zip);

const stage = mkdtempSync(join(tmpdir(), "ccs-pack-"));
for (const item of INCLUDE) {
  cpSync(join(root, item), join(stage, item), {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(root.length + 1).split(sep).join("/");
      if (!rel.startsWith("svg/")) return true;
      return rel === "svg" || SHIP_SVG.includes(basename(src));
    },
  });
}

// Windows PowerShell 5.1 пишет в zip разделитель "\" вопреки спецификации — стор такой
// архив разбирает неверно. Берём pwsh 7+ (кладёт "/"), иначе bsdtar из System32.
const run = (cmd, args) => execFileSync(cmd, args, { cwd: stage, stdio: "pipe" });
try {
  run("pwsh", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path (Get-ChildItem -Force | ForEach-Object FullName) -DestinationPath '${zip}' -CompressionLevel Optimal`,
  ]);
} catch {
  run("tar.exe", ["-a", "-c", "-f", zip, ...INCLUDE]);
}
rmSync(stage, { recursive: true, force: true });

console.log(`✓ ${zip}  ${(readFileSync(zip).length / 1024).toFixed(0)} KB`);
