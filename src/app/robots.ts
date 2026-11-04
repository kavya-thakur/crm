import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    const site = process.env.APP_URL ?? "http://localhost:3000";
    return {
        // /api/ is off limits so a crawler following "Explore the live demo" doesn't sign itself in
        rules: { userAgent: "*", allow: "/", disallow: "/api/" },
        sitemap: `${site}/sitemap.xml`,
    };
}
