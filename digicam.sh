#!/usr/bin/env bash
# digicam.sh — make video look like it came off a 2005–2010 digital camera / camcorder
# Usage:  ./digicam.sh input.mp4 output.mp4
#         ./digicam.sh input.jpg output.png     (try settings on a still)
#
# Steps (in the order an old camera would process them):
#   1. Downscale to 480p (VGA-class sensor)
#   2. Subsample chroma to 1/4 -> colour smears past object edges
#   3. Chroma bleed: blur only the colour planes (U/V), mostly horizontally, plus a
#      slight offset. Grey/neutral areas carry no chroma, so it only shows on colour edges
#   4. Over-sharpen -> bright/dark halos around edges
#   5. Low-quality MJPEG compression -> blocking, jagged edges
#   6. Colour: lifted blacks, bluish shadows, vibrant but not harsh
#   7. Highlight bloom: bright areas glow and warm up
#   8. Sensor grain, upscale to output size
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 input.(mp4|mov|jpg|png...) output.(mp4|png...)" >&2
  echo "Tune with env vars, e.g.: BLEED=4 SAT=1.15 $0 in.mp4 out.mp4 (see README)" >&2
  exit 1
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg not found — install it first (e.g. brew install ffmpeg)" >&2; exit 1; }

IN="$1"; OUT="$2"
RES="${RES:-480}"        # internal resolution: 480 (VGA), 360 or 240 for rougher
SHARP="${SHARP:-1.6}"    # edge halo strength: 0.8 mild, 2.5 harsh
JPEGQ="${JPEGQ:-14}"     # MJPEG quality: 2 = clean, 20+ = heavy blocking
BLOOM="${BLOOM:-0.55}"   # highlight glow: 0 off, 1 strong
THRESH="${THRESH:-170}"  # brightness (0–255) where the glow starts
OUTH="${OUTH:-1080}"     # output height
SAT="${SAT:-1.05}"       # overall saturation: 0.78 washed out, 1.0 unchanged, 1.3 strong
VIBRANCE="${VIBRANCE:-0.35}" # boosts dull colours more than strong ones (spares skin): 0 off, 1 strong
BLEED="${BLEED:-2.5}"    # horizontal chroma bleed (px at internal res): 0 off, 4+ heavy
CSHIFT="${CSHIFT:-1}"    # chroma offset to the right (px): 0 off, 2–3 obvious

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

is_image=0
case "$(printf %s "$IN" | tr '[:upper:]' '[:lower:]')" in *.jpg|*.jpeg|*.png|*.webp|*.bmp) is_image=1;; esac

# --- Stage 1: sensor + in-camera processing + compression -------------------
STAGE1="scale=-2:${RES}:flags=area,\
format=yuv410p,format=yuv444p"
# chroma bleed: blur only the U+V planes (planes=6), horizontal stronger than vertical
if [ "$BLEED" != 0 ]; then
  STAGE1="$STAGE1,gblur=sigma=${BLEED}:sigmaV=$(awk "BEGIN{print ${BLEED}/4}"):planes=6"
fi
if [ "$CSHIFT" != 0 ]; then
  STAGE1="$STAGE1,chromashift=cbh=${CSHIFT}:crh=${CSHIFT}:edge=smear"
fi
STAGE1="$STAGE1,unsharp=5:5:${SHARP}:5:5:0"

if [ "$is_image" = 1 ]; then
  ffmpeg -loglevel error -y -i "$IN" -vf "$STAGE1" -c:v mjpeg -q:v "$JPEGQ" "$TMP/s1.jpg"
  S1="$TMP/s1.jpg"
else
  ffmpeg -loglevel error -y -i "$IN" -vf "$STAGE1,fps=24" \
    -c:v mjpeg -q:v "$JPEGQ" -c:a pcm_s16le "$TMP/s1.avi"
  S1="$TMP/s1.avi"
fi

# --- Stage 2: colour + bloom + grain + upscale -------------------------------
# Output is forced to limited (tv) range + BT.709 and tagged explicitly. Without
# this the file inherits "full range / BT.601" from the MJPEG intermediate, and
# Finder, QuickTime, phones and social apps read it as limited range -> crushed
# blacks, clipped whites, harsh contrast.
FC="[0:v]format=gbrp,\
curves=r='0/0.10 0.5/0.50 1/0.97':g='0/0.13 0.5/0.52 1/0.96':b='0/0.11 0.5/0.47 1/0.92',\
eq=saturation=${SAT}:contrast=0.94,format=gbrp,vibrance=intensity=${VIBRANCE},split[base][hi];\
[hi]lutrgb=r='if(gt(val,${THRESH}),(val-${THRESH})*255/(255-${THRESH}),0)':\
g='if(gt(val,${THRESH}),(val-${THRESH})*255/(255-${THRESH}),0)':\
b='if(gt(val,${THRESH}),(val-${THRESH})*255/(255-${THRESH}),0)',\
gblur=sigma=14,colorchannelmixer=rr=1.0:gg=0.82:bb=0.62,format=gbrp[glow];\
[base][glow]blend=all_mode=screen:all_opacity=${BLOOM},\
noise=alls=7:allf=t,\
scale=-2:${OUTH}:flags=bilinear,\
scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,\
setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709[v]"

if [ "$is_image" = 1 ]; then
  ffmpeg -loglevel error -y -i "$S1" -filter_complex "$FC" -map "[v]" -frames:v 1 "$OUT"
else
  ffmpeg -loglevel error -y -i "$S1" -filter_complex "$FC" -map "[v]" -map 0:a? \
    -c:v libx264 -crf 18 -preset medium \
    -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 160k -movflags +faststart "$OUT"
fi
echo "Done: $OUT"
