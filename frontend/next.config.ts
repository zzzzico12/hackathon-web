import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Amplify / Dockerデプロイに対応
};

export default nextConfig;
