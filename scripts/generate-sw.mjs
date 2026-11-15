import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateSW } from "workbox-build";

const outDir = path.resolve(process.argv[2] || "dist/public");

// Some Vite/Rollup versions resolve before every emitted chunk is visible on
// network-mounted filesystems. Wait on the actual entrypoints in index.html,
// not on an arbitrary timeout.
const indexPath = path.join(outDir, "index.html");
for (let attempt = 0; attempt < 100; attempt += 1) {
  const index = await fs.readFile(indexPath, "utf8");
  const assets = [...index.matchAll(/(?:src|href)="[^"]*\/(assets\/[^"]+)"/g)].map((match) => match[1]);
  const ready = await Promise.all(assets.map(async (asset) => {
    try {
      return (await fs.stat(path.join(outDir, asset))).size > 0;
    } catch {
      return false;
    }
  }));
  if (assets.length > 0 && ready.every(Boolean)) break;
  if (attempt === 99) throw new Error(`PWA: entrypoint assets were not emitted in ${outDir}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return files.flat();
}

const files = (await filesUnder(outDir)).filter((file) => {
  const name = path.basename(file);
  return !name.endsWith(".map") && name !== "sw.js" && !/^workbox-[a-f0-9]+\.js$/.test(name);
});
if (!files.some((file) => path.basename(file) === "index.html")) {
  throw new Error(`PWA: index.html not found in ${outDir}`);
}

const additionalManifestEntries = await Promise.all(files.map(async (file) => {
  const url = path.relative(outDir, file).split(path.sep).join("/");
  const hashedAsset = url.startsWith("assets/") && /\.[a-zA-Z0-9_-]{8}\./.test(path.basename(url));
  return {
    url,
    revision: hashedAsset ? null : createHash("sha256").update(await fs.readFile(file)).digest("hex"),
  };
}));

const result = await generateSW({
  globDirectory: outDir,
  globPatterns: [],
  additionalManifestEntries,
  swDest: path.join(outDir, "sw.js"),
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: "index.html",
  maximumFileSizeToCacheInBytes: 3_000_000,
});

for (const warning of result.warnings) console.warn(warning);
console.log(`PWA: ${result.count} files precached (${Math.round(result.size / 1024)} KiB) in ${outDir}`);
if (result.count !== files.length) throw new Error("PWA manifest is incomplete");
