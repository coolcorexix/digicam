import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path at runtime; keep it out of the bundle
  // and make sure the binary itself ships with the convert function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/convert": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
