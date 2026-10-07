import { digicam } from "@/lib/digicam";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vercel caps request bodies at 4.5 MB; the page downsizes photos before upload.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    return Response.json({ error: "Send an image file." }, { status: 415 });
  }
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) return Response.json({ error: "The file is empty." }, { status: 400 });
  if (body.length > MAX_BYTES) {
    return Response.json({ error: "Photo is over 4 MB after resizing." }, { status: 413 });
  }
  try {
    const jpg = await digicam(body);
    return new Response(new Uint8Array(jpg), {
      headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("digicam failed", err);
    return Response.json({ error: "Couldn't read that image. Try a JPEG or PNG." }, { status: 422 });
  }
}
