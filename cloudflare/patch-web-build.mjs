import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Usage: node patch-web-build.mjs <output directory>");

const indexPath = path.join(outputDirectory, "index.html");
let html = await readFile(indexPath, "utf8");
const headAssets = [
  ["favicon.ico", '    <link rel="shortcut icon" type="image/x-icon" href="favicon.ico">'],
  ["consolewrapper.js", '    <script src="consolewrapper.js"></script>'],
  ["webdb.js", '    <script src="webdb.js"></script>'],
  ["persistence.js", '    <script src="persistence.js"></script>'],
  ["client-config.js", '    <script src="client-config.js"></script>'],
  ["websocket-bridge.js", '    <script src="websocket-bridge.js?v=network-error-1"></script>'],
];

for (const [marker, element] of headAssets) {
  if (!html.includes(marker)) html = html.replace("</head>", `${element}\n  </head>`);
}

html = html.replace('"32, 37, 38, 39, 40"', '"37, 38, 39, 40"');
await writeFile(indexPath, html, "utf8");
