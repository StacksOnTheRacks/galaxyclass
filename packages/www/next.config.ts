import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@galaxyclass/accounts"],
  webpack: (config) => {
    // @galaxyclass/accounts ships NodeNext-style TypeScript that imports siblings as ".js".
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
