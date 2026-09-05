import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/deals',
        destination: '/sales',
        statusCode: 301,
      },
      {
        source: '/services/playstation-store',
        destination: '/playstation',
        statusCode: 301,
      },
      {
        source: '/services/nintendo-eshop',
        destination: '/nintendo',
        statusCode: 301,
      },
      {
        source: '/services/microsoft-store',
        destination: '/xbox',
        statusCode: 301,
      },
    ]
  },
};

export default nextConfig;