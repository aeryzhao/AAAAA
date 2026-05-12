import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = import.meta.dirname;
const IMG_DIR = join(ROOT, 'images');
const MAPPING_PATH = join(ROOT, 'images-mapping.json');
const PROGRESS_PATH = join(ROOT, '.dl-progress.json');
const HTML_PATH = join(ROOT, 'index.html');

mkdirSync(IMG_DIR, { recursive: true });

function loadJSON(p, def) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return def; } }
function saveJSON(p, v) { writeFileSync(p, JSON.stringify(v)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safe(s) { return s.replace(/[\/\\:*?"<>|]/g, '_'); }

function curl(url, timeout = 20) {
  try {
    return execSync(`curl -sL --max-time ${timeout} --retry 2 --retry-delay 3 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`, {
      encoding: 'utf8', timeout: (timeout + 5) * 1000
    });
  } catch { return ''; }
}

function curlDownload(url, dest, timeout = 30) {
  try {
    execSync(`curl -sL --max-time ${timeout} --retry 2 -o "${dest}" "${url}"`, {
      timeout: (timeout + 5) * 1000
    });
    return existsSync(dest) && readFileSync(dest).length > 1000;
  } catch { return false; }
}

// Extract image hashes from Baidu Baike HTML page
function extractBaikeImages(name) {
  const encoded = encodeURIComponent(name);
  const html = curl(`https://baike.baidu.com/item/${encoded}`, 15);
  if (!html) return [];

  // Extract unique image hashes from bkimg.cdn.bcebos.com
  const hashes = [...new Set(
    Array.from(html.matchAll(/bkimg\.cdn\.bcebos\.com\/pic\/([a-f0-9]+)/g), m => m[1])
  )];

  if (!hashes.length) return [];

  // Convert to full image URLs with size parameters
  return hashes.slice(0, 3).map(hash =>
    `https://bkimg.cdn.bcebos.com/pic/${hash}?x-bce-process=image/resize,m_lfit,w_800,limit_1/quality,Q_80`
  );
}

// Also try the Baike API for the main image
function fetchBaikeApiImage(name) {
  const encoded = encodeURIComponent(name);
  const raw = curl(`https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=${encoded}&bk_length=100`, 10);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    const urls = [];
    if (d.image) urls.push(d.image);
    if (d.albumImg) {
      for (const img of d.albumImg) {
        if (img.url) urls.push(img.url);
      }
    }
    return urls.slice(0, 3);
  } catch { return []; }
}

// Generate name variations for better Baike article matching
function searchTerms(name) {
  const terms = [name];

  // Strip suffixes (景区, 风景名胜区, etc.)
  let core = name
    .replace(/(旅游|风景名胜|风景|文化生态|生态文化|跨国|国际|国家|海上丝路|开滦|大运河)?(景区|旅游区|风景名胜区|游览区|旅游度假区|旅游风景区)$/g, '')
    .replace(/(景区|旅游区)$/g, '')
    .trim();

  if (core && core !== name && core.length >= 2) {
    terms.push(core);
  }

  // Strip 2-char city/region prefix from core (e.g. "承德" from "承德避暑山庄")
  if (core.length > 3 && /^[一-龥]{2}/.test(core)) {
    const stripped = core.slice(2);
    if (stripped.length >= 2) terms.push(stripped);
  }

  return [...new Set(terms)];
}

// Main search: try HTML scraping with name variations, then API
function findImages(name) {
  const terms = searchTerms(name);
  const urls = [];

  for (const term of terms) {
    const htmlUrls = extractBaikeImages(term);
    for (const u of htmlUrls) { if (!urls.includes(u)) urls.push(u); }
    if (urls.length >= 2) break;
  }

  if (urls.length >= 2) return urls.slice(0, 3);

  // Fallback: Baike API
  for (const term of terms) {
    const apiUrl = fetchBaikeApiImage(term);
    for (const u of apiUrl) { if (!urls.includes(u)) urls.push(u); }
    if (urls.length >= 1) break;
  }

  return urls.slice(0, 3);
}

// Main
(async () => {
  const spotsMatch = readFileSync(HTML_PATH, 'utf8')
    .match(/const spots=(\[[\s\S]*?\]);\s*\nconst/);
  if (!spotsMatch) { console.error('Cannot find spots data'); process.exit(1); }
  const allSpots = eval(spotsMatch[1]);

  const progress = loadJSON(PROGRESS_PATH, {});
  const mapping = loadJSON(MAPPING_PATH, {});

  // Filter to spots without images
  const target = allSpots.filter(s => !mapping[s.name] || !mapping[s.name].length);
  console.log(`Total spots without images: ${target.length}/${allSpots.length}`);

  let ok = 0, skip = 0, miss = 0;

  for (let i = 0; i < target.length; i++) {
    const name = target[i].name;
    const key = `baike_${name}`;

    // Skip if already processed by this script
    if (progress[key]?.s === 'done') { skip++; continue; }

    process.stdout.write(`\r[${i + 1}/${target.length}] ${name.padEnd(35)} ✓${ok} ✗${miss}`);

    const urls = findImages(name);
    if (!urls.length) {
      progress[key] = { s: 'miss', imgs: 0, t: Date.now() };
      saveJSON(PROGRESS_PATH, progress);
      miss++;
      await sleep(600);
      continue;
    }

    const localPaths = [];
    for (let j = 0; j < urls.length; j++) {
      const ext = urls[j].match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg';
      const file = `${safe(name)}_b${j + 1}.${ext}`;
      const dest = join(IMG_DIR, file);

      if (existsSync(dest) && readFileSync(dest).length > 1000) {
        localPaths.push(`images/${file}`);
        continue;
      }

      if (curlDownload(urls[j], dest)) {
        localPaths.push(`images/${file}`);
      }
      await sleep(300);
    }

    if (localPaths.length) {
      // Merge with existing mapping if any
      const existing = mapping[name] || [];
      mapping[name] = [...existing, ...localPaths];
      ok++;
    }

    progress[key] = { s: 'done', imgs: localPaths.length, t: Date.now() };
    saveJSON(PROGRESS_PATH, progress);
    writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));
    await sleep(800);
  }

  console.log(`\n\nBaike done! With images: ${ok}, Skipped: ${skip}, No image: ${miss}`);
  console.log(`Images: ${IMG_DIR}`);
  console.log(`Mapping: ${MAPPING_PATH}`);
})();
