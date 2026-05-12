import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = import.meta.dirname;
const IMG_DIR = join(ROOT, 'images');
const MAPPING_PATH = join(ROOT, 'images-mapping.json');
const PROGRESS_PATH = join(ROOT, '.dl-progress.json');

mkdirSync(IMG_DIR, { recursive: true });

function loadJSON(p, def) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return def; } }
function saveJSON(p, v) { writeFileSync(p, JSON.stringify(v)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safe(s) { return s.replace(/[\/\\:*?"<>|]/g, '_'); }

// Use curl instead of fetch (more reliable on this network)
function curl(url, timeout = 20) {
  try {
    const out = execSync(`curl -sL --max-time ${timeout} --retry 2 --retry-delay 3 "${url}"`, {
      encoding: 'utf8', timeout: (timeout + 5) * 1000
    });
    return out;
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

// Generate multiple search term variations for a scenic spot
function searchTerms(name) {
  const terms = [name];
  // Strip common suffixes to get core name
  const stripped = name
    .replace(/(旅游|风景名胜|风景|文化生态|生态文化|跨国|国际|国家|海上丝路|开滦|大运河)?(景区|旅游区|风景名胜区|游览区|旅游度假区|旅游风景区)$/g, '')
    .replace(/(景区|旅游区)$/g, '');
  if (stripped && stripped !== name && stripped.length >= 2) {
    terms.push(stripped);
    terms.push(stripped + ' 风景');
  }
  // Also try the full name with qualifier
  terms.push(name + ' 风景');
  return [...new Set(terms)];
}

// Search Wikimedia Commons via curl
function searchCommons(query, limit = 5) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1200&format=json`;
  const raw = curl(url);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    if (!d.query?.pages) return [];
    return Object.values(d.query.pages)
      .filter(p => {
        if (!p.imageinfo?.[0]) return false;
        const t = (p.title || '').toLowerCase();
        if (!/\.(jpe?g|png|webp|gif)$/.test(t)) return false;
        if (t.includes('.djvu') || t.includes('cadal')) return false;
        return (p.imageinfo[0].width || 0) > 300;
      })
      .sort((a, b) => (b.imageinfo[0].width || 0) - (a.imageinfo[0].width || 0))
      .map(p => p.imageinfo[0].thumburl || p.imageinfo[0].url);
  } catch { return []; }
}

// Search Chinese Wikipedia for article images
function searchWikiArticle(name) {
  const url = `https://zh.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(name)}&prop=images&format=json`;
  const raw = curl(url);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    const imgs = d.parse?.images || [];
    return imgs.filter(i => /\.(jpe?g|png|webp|gif)$/i.test(i));
  } catch { return []; }
}

function getWikiImageUrls(fileNames) {
  if (!fileNames.length) return [];
  const titles = fileNames.slice(0, 5).map(f => `File:${f}`).join('|');
  const url = `https://zh.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|size&iiurlwidth=1200&format=json`;
  const raw = curl(url);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    if (!d.query?.pages) return [];
    return Object.values(d.query.pages)
      .filter(p => p.imageinfo?.[0] && (p.imageinfo[0].width || 0) > 300)
      .sort((a, b) => (b.imageinfo[0].width || 0) - (a.imageinfo[0].width || 0))
      .map(p => p.imageinfo[0].thumburl || p.imageinfo[0].url);
  } catch { return []; }
}

// Main search: try multiple strategies
function findImages(name) {
  const found = [];

  // Strategy 1: Chinese Wikipedia article
  const wikiImgs = searchWikiArticle(name);
  if (wikiImgs.length) {
    const urls = getWikiImageUrls(wikiImgs);
    for (const u of urls) { if (!found.includes(u)) found.push(u); }
  }
  if (found.length >= 2) return found.slice(0, 3);
  sleep(500);

  // Strategy 2: Try stripped name on Wikipedia
  const terms = searchTerms(name);
  for (const term of terms.slice(1)) {
    const imgs = searchWikiArticle(term);
    if (imgs.length) {
      const urls = getWikiImageUrls(imgs);
      for (const u of urls) { if (!found.includes(u)) found.push(u); }
    }
    if (found.length >= 2) break;
    sleep(400);
  }
  if (found.length >= 2) return found.slice(0, 3);

  // Strategy 3: Wikimedia Commons search
  for (const term of terms) {
    const urls = searchCommons(term);
    for (const u of urls) { if (!found.includes(u)) found.push(u); }
    if (found.length >= 2) break;
    sleep(500);
  }

  return found.slice(0, 3);
}

// Main
const spots = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .match(/const spots=(\[[\s\S]*?\]);\s*\nconst/);
if (!spots) { console.error('Cannot find spots data'); process.exit(1); }
const allSpots = eval(spots[1]);
console.log(`Total spots: ${allSpots.length}`);

const progress = loadJSON(PROGRESS_PATH, {});
const mapping = loadJSON(MAPPING_PATH, {});
let ok = 0, skip = 0, miss = 0;

for (let i = 0; i < allSpots.length; i++) {
  const name = allSpots[i].name;

  // Skip already done with images
  if (progress[name]?.status === 'done' && progress[name]?.imgs > 0) { skip++; continue; }

  process.stdout.write(`\r[${i + 1}/${allSpots.length}] ${name.padEnd(35)} ✓${ok} ✗${miss}`);

  const urls = findImages(name);
  if (!urls.length) {
    progress[name] = { s: 'miss', t: Date.now() };
    saveJSON(PROGRESS_PATH, progress);
    miss++;
    sleep(600);
    continue;
  }

  const localPaths = [];
  for (let j = 0; j < urls.length; j++) {
    const ext = urls[j].match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg';
    const file = `${safe(name)}_${j + 1}.${ext}`;
    const dest = join(IMG_DIR, file);

    if (existsSync(dest) && readFileSync(dest).length > 1000) {
      localPaths.push(`images/${file}`);
      continue;
    }

    if (curlDownload(urls[j], dest)) {
      localPaths.push(`images/${file}`);
    }
    sleep(300);
  }

  if (localPaths.length) {
    mapping[name] = localPaths;
    ok++;
  }

  progress[name] = { s: 'done', imgs: localPaths.length, t: Date.now() };
  saveJSON(PROGRESS_PATH, progress);
  writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));
  sleep(700);
}

console.log(`\n\nDone! With images: ${ok}, Skipped: ${skip}, No image: ${miss}`);
console.log(`Images: ${IMG_DIR}`);
console.log(`Mapping: ${MAPPING_PATH}`);
