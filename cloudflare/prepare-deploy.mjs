import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = createHash("sha256");
hash.update(process.env.TECHMINO_SERVER_URL || "https://techrater.what-the-fuck.men");
hash.update(process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA || "local");

async function include(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const info = await stat(absolutePath);
  if (info.isDirectory()) {
    for (const name of (await readdir(absolutePath)).sort()) await include(path.join(relativePath, name));
  } else {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(absolutePath));
  }
}

for (const source of ["media", "parts", "Zframework", ".github/build/web/release", "cloudflare", "conf.lua", "main.lua", "version.lua", "legals.md", "license.txt", "package-lock.json"]) {
  await include(source);
}
const fingerprint = hash.digest("hex");
const marker = path.join(root, ".wrangler/techmino-web-fingerprint");
const previous = await readFile(marker, "utf8").catch(() => "");
const outputExists = await stat(path.join(root, "dist/index.html")).then(() => true, () => false);
if (previous === fingerprint && outputExists) {
  console.log("The Techmino web build is up to date.");
} else {
  const result = spawnSync(process.execPath, [path.join(root, "cloudflare/build-web.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("The Techmino web build failed.");
  await mkdir(path.dirname(marker), { recursive: true });
  await writeFile(marker, fingerprint, "utf8");
}
