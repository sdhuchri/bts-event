import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Demo prototype: jangan gagal build hanya karena lint/types.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
