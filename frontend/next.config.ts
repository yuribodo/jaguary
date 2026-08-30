import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "");

if (backendUrl !== undefined) {
  const parsedBackendUrl = new URL(backendUrl);
  if (!["http:", "https:"].includes(parsedBackendUrl.protocol)) {
    throw new Error("BACKEND_URL must be an HTTP(S) URL");
  }
}

const nextConfig: NextConfig = {
  async rewrites() {
    if (backendUrl === undefined) return [];

    return [{
      source: "/api/:path*",
      destination: `${backendUrl}/:path*`,
    }];
  },
};

export default nextConfig;
