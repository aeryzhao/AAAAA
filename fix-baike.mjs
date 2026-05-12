import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = import.meta.dirname;
const IMG_DIR = join(ROOT, 'images');
const MAPPING_PATH = join(ROOT, 'images-mapping.json');
const PROGRESS_PATH = join(ROOT, '.dl-progress.json');
const BAIKE_URLS_PATH = join(ROOT, 'baike-urls.json');
const HTML_PATH = join(ROOT, 'index.html');

mkdirSync(IMG_DIR, { recursive: true });

function loadJSON(p, def) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return def; } }
function saveJSON(p, v) { writeFileSync(p, JSON.stringify(v)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safe(s) { return s.replace(/[\/\\:*?"<>|]/g, '_'); }

function curl(url, timeout = 20) {
  try {
    return execSync(`curl -sL --max-time ${timeout} --retry 2 --retry-delay 3 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`, {
      encoding: 'utf8', timeout: (timeout + 5) * 1000, maxBuffer: 10 * 1024 * 1024
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

function searchTerms(name) {
  const terms = [name];
  let core = name
    .replace(/(旅游|风景名胜|风景|文化生态|生态文化|跨国|国际|国家|海上丝路|开滦|大运河)?(景区|旅游区|风景名胜区|游览区|旅游度假区|旅游风景区)$/g, '')
    .replace(/(景区|旅游区)$/g, '')
    .trim();
  if (core && core !== name && core.length >= 2) terms.push(core);
  if (core.length > 3 && /^[一-龥]{2}/.test(core)) {
    const stripped = core.slice(2);
    if (stripped.length >= 2) terms.push(stripped);
  }
  return [...new Set(terms)];
}

// Fetch a Baike page and return {valid, html} — valid=false means 404
function fetchBaikePage(name) {
  const encoded = encodeURIComponent(name);
  // Retry up to 2 times for transient failures
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = curl(`https://baike.baidu.com/item/${encoded}`, 15);
    if (!html) continue;
    // 404 page contains "error.html" in the source comment
    if (html.includes('error.html')) return { valid: false, html: '' };
    // Valid article pages are typically > 10KB; reject too-short responses
    if (html.length < 8000) continue;
    return { valid: true, html };
  }
  return { valid: false, html: '' };
}

// Extract image URLs from a valid Baike page
function extractImagesFromHtml(html) {
  const hashes = [...new Set(
    Array.from(html.matchAll(/bkimg\.cdn\.bcebos\.com\/pic\/([a-f0-9]+)/g), m => m[1])
  )];
  if (!hashes.length) return [];
  return hashes.slice(0, 3).map(hash =>
    `https://bkimg.cdn.bcebos.com/pic/${hash}?x-bce-process=image/resize,m_lfit,w_800,limit_1/quality,Q_80`
  );
}

// Main
(async () => {
  const spotsMatch = readFileSync(HTML_PATH, 'utf8')
    .match(/const spots=(\[[\s\S]*?\]);\s*\nconst/);
  if (!spotsMatch) { console.error('Cannot find spots data'); process.exit(1); }
  const allSpots = eval(spotsMatch[1]);

  const progress = loadJSON(PROGRESS_PATH, {});
  const mapping = loadJSON(MAPPING_PATH, {});
  const baikeUrls = loadJSON(BAIKE_URLS_PATH, {});

  console.log(`Total spots: ${allSpots.length}`);
  console.log(`With images: ${allSpots.filter(s => mapping[s.name]?.length).length}`);
  console.log(`Already have baike URL: ${Object.keys(baikeUrls).length}`);

  let found = 0, skipped = 0, missed = 0, imgOk = 0;

  for (let i = 0; i < allSpots.length; i++) {
    const name = allSpots[i].name;
    const key = `fix_${name}`;
    const hasImages = mapping[name]?.length > 0;
    const hasBaikeUrl = !!baikeUrls[name];

    // Skip if already processed by this script
    if (progress[key]?.s === 'done') { skipped++; continue; }

    process.stdout.write(`\r[${i + 1}/${allSpots.length}] ${name.padEnd(35)} 找到:${found} 图片:${imgOk} 失败:${missed}`);

    const terms = searchTerms(name);
    let result = null;

    for (const term of terms) {
      const { valid, html } = fetchBaikePage(term);
      if (valid) {
        result = { articleName: term, html };
        break;
      }
      await sleep(300);
    }

    if (!result) {
      // Fallback: try Baike API
      const encoded = encodeURIComponent(name);
      const raw = curl(`https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=${encoded}&bk_length=100`, 10);
      if (raw) {
        try {
          const d = JSON.parse(raw);
          if (d && d.abstract && d.abstract.length > 5) {
            result = { articleName: name, html: '' };
          }
        } catch {}
      }
    }

    if (result) {
      // Save the valid article name
      if (!baikeUrls[name]) {
        baikeUrls[name] = result.articleName;
        writeFileSync(BAIKE_URLS_PATH, JSON.stringify(baikeUrls, null, 2));
      }
      found++;

      // Download images if the spot doesn't have any
      if (!hasImages && result.html) {
        const images = extractImagesFromHtml(result.html);
        if (images.length) {
          const localPaths = [];
          for (let j = 0; j < images.length; j++) {
            const ext = images[j].match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg';
            const file = `${safe(name)}_b${j + 1}.${ext}`;
            const dest = join(IMG_DIR, file);

            if (existsSync(dest) && readFileSync(dest).length > 1000) {
              localPaths.push(`images/${file}`);
              continue;
            }
            if (curlDownload(images[j], dest)) {
              localPaths.push(`images/${file}`);
            }
            await sleep(300);
          }
          if (localPaths.length) {
            mapping[name] = localPaths;
            writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));
            imgOk++;
          }
        }
      }
    } else {
      missed++;
    }

    progress[key] = { s: 'done', imgs: hasImages || mapping[name]?.length || 0, t: Date.now() };
    saveJSON(PROGRESS_PATH, progress);
    await sleep(500);
  }

  console.log(`\n\nDone! Found article: ${found}, New images: ${imgOk}, No article: ${missed}, Skipped: ${skipped}`);
  console.log(`Baike URLs: ${BAIKE_URLS_PATH}`);
})();
