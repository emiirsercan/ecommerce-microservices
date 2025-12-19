import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // <--- BU SATIRI EKLE
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;