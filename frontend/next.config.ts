import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: ['172.20.10.10:3000', '172.20.10.10'],
};

export default nextConfig;
