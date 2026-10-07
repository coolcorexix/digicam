"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "busy" | "done" | "error";

const MAX_SIDE = 1600;

// Downsize in the browser so uploads stay well under Vercel's 4.5 MB body cap.
// The look is built at 480p anyway, so nothing visible is lost.
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.92),
  );
}

export default function Page() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [size, setSize] = useState<string>("");
  const [name, setName] = useState("photo");
  const [peek, setPeek] = useState(false);
  const [shots, setShots] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (original) URL.revokeObjectURL(original);
  }, [original]);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result);
  }, [result]);

  const develop = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("That's not an image. Pick a JPEG or PNG.");
      return;
    }
    setStatus("busy");
    setMessage("");
    setPeek(false);
    setName(file.name.replace(/\.[^.]+$/, "") || "photo");
    try {
      const small = await shrink(file);
      setOriginal(URL.createObjectURL(small));
      setResult(null);
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: small,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        throw new Error(error || `Conversion failed (${res.status}). Try again.`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => setSize(`${img.naturalWidth}×${img.naturalHeight}`);
      img.src = url;
      setResult(url);
      setShots((n) => n + 1);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error && err.message !== "encode"
          ? err.message
          : "This browser can't open that file. Try a JPEG or PNG.",
      );
    }
  }, []);

  const shown = peek && original ? original : result ?? (status === "busy" ? original : null);

  return (
    <main>
      <section className="camera" aria-label="digicam">
        <button className="shutter" onClick={() => input.current?.click()} disabled={status === "busy"}>
          <span className="release" aria-hidden />
          {result ? "Choose another photo" : "Choose a photo"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            develop(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="body">
          <div className="brand">
            <h1>digicam</h1>
            <span className="model">DX-07</span>
            <span className={`led ${status === "busy" ? "blink" : ""}`} aria-hidden />
          </div>

          <div
            className={`bezel ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              develop(e.dataTransfer.files?.[0]);
            }}
            onClick={() => !result && status !== "busy" && input.current?.click()}
            style={{ cursor: !result && status !== "busy" ? "pointer" : undefined }}
          >
            <div className="lcd" aria-live="polite">
              {shown && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shown}
                  alt={peek ? "Original photo" : "Photo with the digicam look"}
                  className={status === "busy" ? "dim" : ""}
                />
              )}
              <div className="osd">
                <span className="tl">{peek ? "▶ Original" : "P"}</span>
                <span className="tr" aria-hidden>
                  <i className="battery" />
                </span>
                {status === "done" && <span className="bl">{size}</span>}
                <span className="br">{String(shots).padStart(4, "0")}</span>
                {status === "idle" && (
                  <p className="center">
                    Tap or drop
                    <br />
                    a photo here
                  </p>
                )}
                {status === "busy" && <p className="center blink">Processing…</p>}
                {status === "error" && <p className="center warn">{message}</p>}
              </div>
            </div>
          </div>

          <div className="controls">
            <button
              className="key"
              disabled={!result}
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setPeek(true)}
              onKeyUp={() => setPeek(false)}
              onBlur={() => setPeek(false)}
            >
              <span className="glyph" aria-hidden>▶</span>
              Hold to see original
            </button>
            <a
              className="key"
              aria-disabled={!result}
              href={result ?? undefined}
              download={`${name}-digicam.jpg`}
              onClick={(e) => !result && e.preventDefault()}
            >
              <span className="glyph" aria-hidden>↓</span>
              Save photo
            </a>
          </div>
        </div>
      </section>

      <footer>
        <p>
          Drop in a photo and it comes back looking like it was shot on a 2007 point-and-shoot: soft,
          grainy, with colour bleeding at the edges.
        </p>
        <p className="quiet">
          Photos are converted and thrown away; nothing is stored. Want it for video?{" "}
          <a href="https://github.com/coolcorexix/digicam">The script is open source</a>.
        </p>
      </footer>
    </main>
  );
}
