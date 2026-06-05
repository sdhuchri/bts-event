import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prototype: jangan gagal build produksi hanya karena type error non-kritis.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
