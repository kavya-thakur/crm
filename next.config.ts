import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the three option lists used to have a page each; they now share one
  redirects() {
    return ["pipeline", "lead-stages", "lead-sources"].map((old) => ({
      source: `/settings/${old}`,
      destination: "/settings/stages",
      permanent: true,
    }));
  },
};

export default nextConfig;
