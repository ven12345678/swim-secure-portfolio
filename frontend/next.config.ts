import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: ['192.168.0.3:3000', '192.168.0.3'],
};

export default nextConfig;
