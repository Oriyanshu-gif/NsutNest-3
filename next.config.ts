import type { NextConfig } from "next";

// The bundled Android build ships the pages inside the APK, so it needs a
// static export; the website keeps the normal server build.
const bundling = process.env.APP_EXPORT === "1";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  ...(bundling ? { output: "export", images: { unoptimized: true }, trailingSlash: true } : {}),
};

export default nextConfig;
