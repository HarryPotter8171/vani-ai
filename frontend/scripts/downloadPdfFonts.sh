#!/bin/bash
# Download Noto Sans TTFs used by multilingual PDF export.
set -euo pipefail

BASE="https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf"
CJK_VF="https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/fonts/pdf"
mkdir -p "$OUT"

# Seed from existing Devanagari if present
SRC_DEV="$(cd "$(dirname "$0")/.." && pwd)/lib/export/fonts/NotoSansDevanagari-Regular.ttf"
if [[ -f "$SRC_DEV" && ! -f "$OUT/NotoSansDevanagari-Regular.ttf" ]]; then
  cp "$SRC_DEV" "$OUT/NotoSansDevanagari-Regular.ttf"
fi

download() {
  local name="$1"
  local url="$2"
  if [[ -f "$OUT/$name" ]]; then
    local sz
    sz=$(wc -c < "$OUT/$name" | tr -d ' ')
    if [[ "$sz" -gt 10000 ]]; then
      echo "SKIP $name ($sz bytes)"
      return 0
    fi
  fi
  echo "GET $name"
  local code
  code=$(curl -sL -o "$OUT/$name" -w "%{http_code}" "$url" --max-time 180)
  local size
  size=$(wc -c < "$OUT/$name" | tr -d ' ')
  local ft
  ft=$(file -b "$OUT/$name" 2>/dev/null | cut -c1-60)
  echo "  -> HTTP $code size=$size type=$ft"
  if [[ "$code" != "200" || "$size" -lt 10000 ]]; then
    echo "  FAIL"
    rm -f "$OUT/$name"
    return 1
  fi
}

download "NotoSans-Regular.ttf" "$BASE/NotoSans/NotoSans-Regular.ttf"
download "NotoSansDevanagari-Regular.ttf" "$BASE/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"
download "NotoSansGujarati-Regular.ttf" "$BASE/NotoSansGujarati/NotoSansGujarati-Regular.ttf"
download "NotoSansGurmukhi-Regular.ttf" "$BASE/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf"
download "NotoSansBengali-Regular.ttf" "$BASE/NotoSansBengali/NotoSansBengali-Regular.ttf"
download "NotoSansOriya-Regular.ttf" "$BASE/NotoSansOriya/NotoSansOriya-Regular.ttf"
download "NotoSansTamil-Regular.ttf" "$BASE/NotoSansTamil/NotoSansTamil-Regular.ttf"
download "NotoSansTelugu-Regular.ttf" "$BASE/NotoSansTelugu/NotoSansTelugu-Regular.ttf"
download "NotoSansKannada-Regular.ttf" "$BASE/NotoSansKannada/NotoSansKannada-Regular.ttf"
download "NotoSansMalayalam-Regular.ttf" "$BASE/NotoSansMalayalam/NotoSansMalayalam-Regular.ttf"
download "NotoSansArabic-Regular.ttf" "$BASE/NotoSansArabic/NotoSansArabic-Regular.ttf"
download "NotoSansHebrew-Regular.ttf" "$BASE/NotoSansHebrew/NotoSansHebrew-Regular.ttf"
download "NotoSansThai-Regular.ttf" "$BASE/NotoSansThai/NotoSansThai-Regular.ttf"
download "NotoSansEthiopic-Regular.ttf" "$BASE/NotoSansEthiopic/NotoSansEthiopic-Regular.ttf"
download "NotoSansSinhala-Regular.ttf" "$BASE/NotoSansSinhala/NotoSansSinhala-Regular.ttf"
download "NotoSansMyanmar-Regular.ttf" "$BASE/NotoSansMyanmar/NotoSansMyanmar-Regular.ttf"
download "NotoSansKhmer-Regular.ttf" "$BASE/NotoSansKhmer/NotoSansKhmer-Regular.ttf"
download "NotoSansLao-Regular.ttf" "$BASE/NotoSansLao/NotoSansLao-Regular.ttf"
download "NotoSansMongolian-Regular.ttf" "$BASE/NotoSansMongolian/NotoSansMongolian-Regular.ttf"
download "NotoSerifTibetan-Regular.ttf" "$BASE/NotoSerifTibetan/NotoSerifTibetan-Regular.ttf"

# CJK Variable TrueType subsets (jsPDF requires glyf/TTF — CFF OTFs fail at encode)
download "NotoSansSC-Regular.ttf" "$CJK_VF/NotoSansSC-VF.ttf" || true
download "NotoSansTC-Regular.ttf" "$CJK_VF/NotoSansTC-VF.ttf" || true
download "NotoSansJP-Regular.ttf" "$CJK_VF/NotoSansJP-VF.ttf" || true
download "NotoSansKR-Regular.ttf" "$CJK_VF/NotoSansKR-VF.ttf" || true

echo ""
echo "=== Font inventory ==="
ls -lh "$OUT"
echo ""
du -sh "$OUT"
