import type { Metadata, Viewport } from "next";
import { Archivo, DotGothic16 } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-body" });
const osd = DotGothic16({ subsets: ["latin"], weight: "400", variable: "--font-osd" });

export const metadata: Metadata = {
  title: "digicam",
  description: "Turn a photo into a 2007 point-and-shoot shot: soft, grainy, colour bleeding at the edges.",
};

export const viewport: Viewport = { themeColor: "#9fb1bf" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${osd.variable}`}>
      <body>{children}</body>
    </html>
  );
}
