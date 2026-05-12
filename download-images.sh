#!/bin/bash
# Download scenic spot images using curl (more reliable than Node.js fetch)
set -e

IMG_DIR="/Users/codance/code/vibecoding/AAAAA/images"
MAPPING_FILE="/Users/codance/code/vibecoding/AAAAA/images-mapping.json"
PROGRESS_FILE="/Users/codance/code/vibecoding/AAAAA/.dl-progress.txt"
HTML_FILE="/Users/codance/code/vibecoding/AAAAA/index.html"

mkdir -p "$IMG_DIR"
touch "$PROGRESS_FILE"

# Extract spot names from HTML
extract_names() {
  node -e "
    const html = require('fs').readFileSync('$HTML_FILE','utf8');
    const m = html.match(/const spots=(\[[\s\S]*?\]);\s*\nconst/);
    const spots = eval(m[1]);
    spots.forEach(s => console.log(s.name));
  "
}

safe_name() {
  echo "$1" | sed 's/[\/\\:*?"<>|]/_/g'
}

search_wiki_api() {
  local query="$1"
  curl -sL --max-time 15 \
    "https://zh.wikipedia.org/w/api.php?action=parse&page=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$query'))")&prop=images&format=json" \
    2>/dev/null || echo '{}'
}

get_image_urls() {
  local file_names="$1"
  local encoded=$(python3 -c "
import urllib.parse
files = '$file_names'.split('||')
titles = '|'.join('File:' + f for f in files[:5])
print(urllib.parse.quote(titles))
")
  curl -sL --max-time 15 \
    "https://zh.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=imageinfo&iiprop=url|size&iiurlwidth=1200&format=json" \
    2>/dev/null || echo '{}'
}

download_one_spot() {
  local name="$1"
  local safe=$(safe_name "$name")
  local progress_key="$name"

  # Skip if already done
  if grep -qF "$progress_key" "$PROGRESS_FILE" 2>/dev/null; then
    return
  fi

  echo -n "  $name"

  # Try to get images from Chinese Wikipedia article
  local wiki_json=$(search_wiki_api "$name")
  local images=$(echo "$wiki_json" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    imgs = d.get('parse',{}).get('images',[])
    # Filter to only image files
    imgs = [i for i in imgs if any(i.lower().endswith(ext) for ext in ['.jpg','.jpeg','.png','.webp','.gif'])]
    print('||'.join(imgs[:5]))
except: pass
" 2>/dev/null)

  if [ -z "$images" ]; then
    # Try shorter name (remove common suffixes)
    local short_name=$(echo "$name" | sed 's/风景名胜区//;s/旅游景区//;s/旅游区//;s/风景区//;s/景区//;s/风景区//')
    if [ "$short_name" != "$name" ] && [ -n "$short_name" ]; then
      wiki_json=$(search_wiki_api "$short_name")
      images=$(echo "$wiki_json" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    imgs = d.get('parse',{}).get('images',[])
    imgs = [i for i in imgs if any(i.lower().endswith(ext) for ext in ['.jpg','.jpeg','.png','.webp','.gif'])]
    print('||'.join(imgs[:5]))
except: pass
" 2>/dev/null)
    fi
  fi

  if [ -z "$images" ]; then
    echo " (no wiki article)"
    echo "$progress_key" >> "$PROGRESS_FILE"
    return
  fi

  # Get actual URLs for the images
  local urls_json=$(get_image_urls "$images")
  local urls=$(echo "$urls_json" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    pages = list(d.get('query',{}).get('pages',{}).values())
    pages = [p for p in pages if 'imageinfo' in p and p['imageinfo'][0].get('width',0) > 300]
    pages.sort(key=lambda p: p['imageinfo'][0].get('width',0), reverse=True)
    for p in pages[:3]:
        ii = p['imageinfo'][0]
        print(ii.get('thumburl') or ii.get('url',''))
except: pass
" 2>/dev/null)

  if [ -z "$urls" ]; then
    echo " (no image urls)"
    echo "$progress_key" >> "$PROGRESS_FILE"
    return
  fi

  # Download images
  local count=0
  local local_paths=""
  local idx=1
  while IFS= read -r url; do
    [ -z "$url" ] && continue
    local ext="jpg"
    if echo "$url" | grep -qi '\.png'; then ext="png"
    elif echo "$url" | grep -qi '\.webp'; then ext="webp"
    elif echo "$url" | grep -qi '\.gif'; then ext="gif"
    fi
    local filename="${safe}_${idx}.${ext}"
    local dest="$IMG_DIR/$filename"

    if [ -f "$dest" ]; then
      local_paths="${local_paths}images/${filename},"
      count=$((count+1))
    else
      if curl -sL --max-time 30 "$url" -o "$dest" 2>/dev/null && [ -s "$dest" ]; then
        local_paths="${local_paths}images/${filename},"
        count=$((count+1))
      else
        rm -f "$dest"
      fi
    fi
    idx=$((idx+1))
    sleep 0.3
  done <<< "$urls"

  if [ $count -gt 0 ]; then
    echo " (${count} images)"
    # Update mapping
    node -e "
      const fs = require('fs');
      const mapping = fs.existsSync('$MAPPING_FILE') ? JSON.parse(fs.readFileSync('$MAPPING_FILE','utf8')) : {};
      mapping['$name'] = '${local_paths}'.split(',').filter(Boolean);
      fs.writeFileSync('$MAPPING_FILE', JSON.stringify(mapping, null, 2));
    "
  else
    echo " (download failed)"
  fi

  echo "$progress_key" >> "$PROGRESS_FILE"
  sleep 0.5
}

# Main
echo "Starting image download..."
total=$(extract_names | wc -l | tr -d ' ')
echo "Total spots: $total"

i=0
extract_names | while IFS= read -r name; do
  i=$((i+1))
  printf "[%d/%d] " "$i" "$total"
  download_one_spot "$name"
done

echo ""
echo "Done! Images in: $IMG_DIR"
echo "Mapping: $MAPPING_FILE"
