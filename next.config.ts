import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Gallery videos are up to 50 MB (+ multipart overhead). nginx only allows this size on /admin/.
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
