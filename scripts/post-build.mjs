import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";

const dist = "dist";

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function shortSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return Date.now().toString(36);
  }
}

const BASE = "/sheetly";
const VERSION = shortSha();
const from = "dist/index.html";
const to = "dist/404.html";

if (!existsSync(from)) {
  console.error(`post-build: ${from} not found - run vite build first`);
  process.exit(1);
}

// GitHub Pages serves 404.html for any unknown path under the subpath, so we
// ship the same SPA shell as 404.html to render unknown deep links.
copyFileSync(from, to);

// Regenerate dist/sw.js so the precache list always matches this build's real
// files and the version is stamped per deploy. That way a returning client
// detects the new worker, activates it, and re-caches instead of serving
// stale assets after every release.
const swPath = join(dist, "sw.js");
if (!existsSync(swPath)) {
  console.error(`post-build: ${swPath} not found - run vite build first`);
  process.exit(1);
}

const precache = [
  `${BASE}/`,
  ...listFiles(dist)
    .filter((p) => p !== swPath && !p.endsWith(".map"))
    .map((p) => `${BASE}/${relative(dist, p).replace(/\\/g, "/")}`)
    .sort(),
];

let sw = readFileSync(swPath, "utf8");
sw = sw.replace(/const VERSION = "v1";/, `const VERSION = "${VERSION}";`);
sw = sw.replace(
  /const PRECACHE = \[[\s\S]*?\n\];/,
  `const PRECACHE = [\n${precache.map((p) => `  \`${p}\`,`).join("\n")}\n];`,
);
writeFileSync(swPath, sw);

console.log(`post-build: copied ${from} -> ${to}`);
console.log(`post-build: stamped sw.js (version ${VERSION}, ${precache.length} precache entries)`);
