import type { NextConfig } from "next";

const allowedOrigins = ["localhost:3000"];

const tunnelUrl = process.env.NEXT_PUBLIC_TUNNEL_URL;
if (tunnelUrl) {
  const hostName = tunnelUrl.replace(/^https?:\/\//, "");
  if (hostName) {
    allowedOrigins.push(hostName);
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.17'],
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;

