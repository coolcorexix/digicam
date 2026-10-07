// Same pipeline as ../digicam.sh (image path), with its default knobs.
// Keep the two in sync when tuning the look.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

const K = {
  RES: 480, // internal resolution (VGA-class sensor)
  SHARP: 1.6, // edge halo strength
  JPEGQ: 14, // in-camera MJPEG quality (higher = blockier)
  BLOOM: 0.55, // highlight glow
  THRESH: 170, // brightness where the glow starts
  OUTH: 1080, // output height
  SAT: 1.05,
  VIBRANCE: 0.35,
  BLEED: 2.5, // horizontal chroma bleed, px at RES
  CSHIFT: 1, // chroma offset to the right, px
};

// Stage 1: sensor + in-camera processing + compression
const stage1 = [
  `scale=-2:${K.RES}:flags=area`,
  "format=yuv410p,format=yuv444p",
  `gblur=sigma=${K.BLEED}:sigmaV=${K.BLEED / 4}:planes=6`,
  `chromashift=cbh=${K.CSHIFT}:crh=${K.CSHIFT}:edge=smear`,
  `unsharp=5:5:${K.SHARP}:5:5:0`,
].join(",");

// Stage 2: colour + bloom + grain + upscale. Ends in rgb24 so the JPEG encoder
// writes a standard full-range JPEG.
const lift = `if(gt(val,${K.THRESH}),(val-${K.THRESH})*255/(255-${K.THRESH}),0)`;
const stage2 =
  "[0:v]format=gbrp," +
  "curves=r='0/0.10 0.5/0.50 1/0.97':g='0/0.13 0.5/0.52 1/0.96':b='0/0.11 0.5/0.47 1/0.92'," +
  `eq=saturation=${K.SAT}:contrast=0.94,format=gbrp,vibrance=intensity=${K.VIBRANCE},split[base][hi];` +
  `[hi]lutrgb=r='${lift}':g='${lift}':b='${lift}',` +
  "gblur=sigma=14,colorchannelmixer=rr=1.0:gg=0.82:bb=0.62,format=gbrp[glow];" +
  `[base][glow]blend=all_mode=screen:all_opacity=${K.BLOOM},` +
  "noise=alls=7:allf=t," +
  `scale=-2:${K.OUTH}:flags=bilinear,format=rgb24[v]`;

export async function digicam(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary missing");
  const dir = await mkdtemp(join(tmpdir(), "digicam-"));
  try {
    const src = join(dir, "in");
    const s1 = join(dir, "s1.jpg");
    const out = join(dir, "out.jpg");
    await writeFile(src, input);
    const ff = (args: string[]) =>
      run(ffmpegPath as string, ["-loglevel", "error", "-y", ...args], { timeout: 25_000 });
    await ff(["-i", src, "-vf", stage1, "-frames:v", "1", "-c:v", "mjpeg", "-q:v", String(K.JPEGQ), s1]);
    await ff(["-i", s1, "-filter_complex", stage2, "-map", "[v]", "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "2", out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
