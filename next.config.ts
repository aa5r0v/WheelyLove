import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Gallery videos are up to 50 MB (+ multipart overhead). nginx only allows this size on /admin/gallery.
    serverActions: {
      bodySizeLimit: "55mb",
    },
    // proxy.ts (Clerk) buffers request bodies and silently truncates them above this limit (default 10 MB),
    // which would corrupt large uploads. Keep it equal to the server action limit.
    proxyClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
