import type { MetadataRoute } from "next";

// The public pages; everything else is the app behind login
const PAGES = ["/", "/product", "/pricing", "/demo", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
    const site = process.env.APP_URL ?? "http://localhost:3000";
    return PAGES.map((path) => ({ url: `${site}${path}` }));
}
