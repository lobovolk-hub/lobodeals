import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/deals',
        destination: '/sales',
        statusCode: 301,
      },
    ]
  },
};

export default nextConfig;
