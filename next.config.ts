import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Going back to a page within 30 seconds (Leads → Deals → Leads) reuses it instead of asking the
    // server again; Next's default since v15 is 0. The data on it comes from the API cache anyway
    // (QueryProvider), and anything that changes what a page shows (a role, billing) calls
    // router.refresh(), which drops this cache (LiveUpdates).
    staleTimes: { dynamic: 30 },
  },
  // Redis and the job queue use Node's own networking; load them as plain packages, not bundled
  serverExternalPackages: ["bullmq", "ioredis", "nodemailer"],
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
