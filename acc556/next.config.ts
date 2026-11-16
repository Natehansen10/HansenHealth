import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of the main repo; pin the workspace root
  // so Next does not walk up and pick the production app's lockfile.
  turbopack: { root: __dirname },
};

export default nextConfig;
