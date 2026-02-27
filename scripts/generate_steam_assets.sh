#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${1:-$ROOT_DIR/assets-src}"
OUT_DIR="${2:-$ROOT_DIR/steam-assets}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg is required but not installed." >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: source directory not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"/store "$OUT_DIR"/library "$OUT_DIR"/screenshots "$OUT_DIR"/logs "$OUT_DIR"/tmp

pick_first_match() {
  local pattern="$1"
  find "$SRC_DIR" -type f | grep -Ei "$pattern" | head -n 1 || true
}

FONT_FILE="$(pick_first_match '\.(ttf|otf)$')"
BG_FILE="$(pick_first_match '(^|/)(bg|background).*\.(png|jpe?g|webp)$')"
LOGO_FILE="$(pick_first_match 'logo.*\.(png|jpe?g|webp)$')"
ICON_FILE="$(pick_first_match '(icon|app-icon).*\.(png|jpe?g|webp)$')"
BG_REPEAT_SOURCE="$(pick_first_match '(^|/)bg\.png$')"

if [[ -z "$BG_FILE" ]]; then
  BG_FILE="$(pick_first_match '(screenshot|gameplay).*\.(png|jpe?g|webp)$')"
fi
if [[ -z "$BG_FILE" ]]; then
  BG_FILE="$ICON_FILE"
fi

if [[ -z "$BG_FILE" ]]; then
  BG_FILE="$OUT_DIR/tmp/fallback-bg.png"
  ffmpeg -v error -y -f lavfi -i "color=c=#1f2937:s=2048x1152" -frames:v 1 "$BG_FILE"
fi

if [[ -z "$BG_REPEAT_SOURCE" ]]; then
  BG_REPEAT_SOURCE="$BG_FILE"
fi

if [[ -z "$LOGO_FILE" ]]; then
  LOGO_FILE="$ICON_FILE"
fi

SCREENSHOT_FILES=()
while IFS= read -r file; do
  SCREENSHOT_FILES+=("$file")
done < <(find "$SRC_DIR" -type f | grep -Ei '(screenshot|gameplay).*\\.(png|jpe?g|webp)$' || true)

if [[ ${#SCREENSHOT_FILES[@]} -eq 0 ]]; then
  while IFS= read -r file; do
    SCREENSHOT_FILES+=("$file")
  done < <(find "$SRC_DIR" -type f | grep -Ei '\.(png|jpe?g|webp)$' | grep -Eiv '(logo|icon|bg|background)' || true)
fi

if [[ ${#SCREENSHOT_FILES[@]} -eq 0 && -n "$BG_FILE" ]]; then
  SCREENSHOT_FILES+=("$BG_FILE")
fi

if [[ ${#SCREENSHOT_FILES[@]} -eq 0 ]]; then
  echo "Error: no usable image sources found in $SRC_DIR" >&2
  exit 1
fi

build_base_filter() {
  local w="$1"
  local h="$2"
  printf "scale=%sx%s:force_original_aspect_ratio=increase,crop=%s:%s,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill,eq=contrast=1.04:saturation=1.06" "$w" "$h" "$w" "$h"
}

get_image_dims() {
  local file="$1"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$file"
}

create_tiled_canvas() {
  local src="$1"
  local w="$2"
  local h="$3"
  local out="$4"
  local mode="${5:-normal}"

  local dims
  dims="$(get_image_dims "$src")"
  local sw="${dims%x*}"
  local sh="${dims#*x}"

  if [[ -z "$sw" || -z "$sh" || "$sw" == "$dims" ]]; then
    sw=512
    sh=512
  fi

  if (( sw < 1 )); then sw=512; fi
  if (( sh < 1 )); then sh=512; fi

  local cols=$(( (w + sw - 1) / sw ))
  local rows=$(( (h + sh - 1) / sh ))
  if (( cols < 1 )); then cols=1; fi
  if (( rows < 1 )); then rows=1; fi
  local frames=$(( cols * rows ))

  local vf="tile=${cols}x${rows}:padding=0:margin=0,crop=${w}:${h}"
  if [[ "$mode" == "capsule-pink" ]]; then
    vf+=",eq=contrast=1.07:saturation=1.35:brightness=0.03,drawbox=x=0:y=0:w=iw:h=ih:color=#ff4fa3@0.24:t=fill"
  else
    vf+=",eq=contrast=1.03:saturation=1.08"
  fi

  ffmpeg -v error -y \
    -stream_loop -1 -i "$src" \
    -frames:v "$frames" \
    -vf "$vf" \
    -frames:v 1 "$out"
}

make_capsule() {
  local out="$1"
  local w="$2"
  local h="$3"
  local with_logo="$4"
  local bg_src="${5:-$BG_FILE}"

  local overlay_source=""
  if [[ -n "$LOGO_FILE" ]]; then
    overlay_source="$LOGO_FILE"
  elif [[ -n "$ICON_FILE" ]]; then
    overlay_source="$ICON_FILE"
  fi

  local tiled_bg="$OUT_DIR/tmp/tiled_${w}x${h}_capsule.png"
  create_tiled_canvas "$bg_src" "$w" "$h" "$tiled_bg" "capsule-pink"

  if [[ "$with_logo" == "true" && -n "$overlay_source" ]]; then
    local logo_w=$((w * 86 / 100))
    local logo_h=$((h * 74 / 100))
    ffmpeg -v error -y \
      -i "$tiled_bg" \
      -i "$overlay_source" \
      -filter_complex "[0:v]format=rgba[bg];[1:v]scale=${logo_w}:${logo_h}:force_original_aspect_ratio=decrease[logo];[bg][logo]overlay=(W-w)/2:(H-h)/2:format=auto" \
      -frames:v 1 "$out"
    return
  fi
  cp "$tiled_bg" "$out"
}

make_image_only() {
  local out="$1"
  local w="$2"
  local h="$3"
  local tiled_bg="$OUT_DIR/tmp/tiled_${w}x${h}_normal.png"
  create_tiled_canvas "$BG_FILE" "$w" "$h" "$tiled_bg" "normal"
  cp "$tiled_bg" "$out"
}

make_library_logo() {
  local out="$1"
  local overlay_source=""
  if [[ -n "$LOGO_FILE" ]]; then
    overlay_source="$LOGO_FILE"
  elif [[ -n "$ICON_FILE" ]]; then
    overlay_source="$ICON_FILE"
  fi

  if [[ -n "$overlay_source" ]]; then
    ffmpeg -v error -y \
      -f lavfi -i "color=color=black@0.0:s=1280x720,format=rgba" \
      -i "$overlay_source" \
      -filter_complex "[1:v]scale=1180:640:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2:format=auto" \
      -frames:v 1 "$out"
    return
  fi

  ffmpeg -v error -y -f lavfi -i "color=color=black@0.0:s=1280x720,format=rgba" -frames:v 1 "$out"
}

make_screenshot() {
  local src="$1"
  local out="$2"
  ffmpeg -v error -y \
    -i "$src" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#120818,eq=contrast=1.02:saturation=1.05" \
    -frames:v 1 "$out"
}

echo "Generating required Steam assets into: $OUT_DIR"

make_capsule "$OUT_DIR/store/header_capsule.png" 920 430 true "$BG_REPEAT_SOURCE"
make_capsule "$OUT_DIR/store/small_capsule.png" 462 174 true "$BG_REPEAT_SOURCE"
make_capsule "$OUT_DIR/store/main_capsule.png" 1232 706 true "$BG_REPEAT_SOURCE"
make_capsule "$OUT_DIR/store/vertical_capsule.png" 748 896 true "$BG_REPEAT_SOURCE"

make_capsule "$OUT_DIR/library/library_capsule.png" 600 900 true "$BG_REPEAT_SOURCE"
make_capsule "$OUT_DIR/library/library_header.png" 920 430 true
make_image_only "$OUT_DIR/library/library_hero.png" 3840 1240
make_library_logo "$OUT_DIR/library/library_logo.png"

for i in 1 2 3 4 5; do
  idx=$(( (i - 1) % ${#SCREENSHOT_FILES[@]} ))
  src="${SCREENSHOT_FILES[$idx]}"
  out="$OUT_DIR/screenshots/screenshot_0${i}.png"
  make_screenshot "$src" "$out"
done

cat > "$OUT_DIR/logs/manifest.yml" <<EOF
steam_assets_generation:
  generated_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  source_dir: "$SRC_DIR"
  sources_used:
    background: "${BG_FILE:-none}"
    logo: "${LOGO_FILE:-none}"
    icon: "${ICON_FILE:-none}"
    font: "${FONT_FILE:-none}"
    screenshots_count: ${#SCREENSHOT_FILES[@]}
  outputs:
    store:
      - header_capsule.png
      - small_capsule.png
      - main_capsule.png
      - vertical_capsule.png
    screenshots:
      - screenshot_01.png
      - screenshot_02.png
      - screenshot_03.png
      - screenshot_04.png
      - screenshot_05.png
    library:
      - library_capsule.png
      - library_header.png
      - library_hero.png
      - library_logo.png
EOF

echo "Done. Required assets generated."