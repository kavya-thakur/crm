import type { Metadata } from "next";

// What every public page tells search engines and link previews. The root layout hides the app
// from search (it's behind login), so these pages opt back in. Paths are made full addresses
// from metadataBase (APP_URL).
export function pageMetadata(path: string, title: string, description: string): Metadata {
    return {
        title,
        description,
        // the one address Google should list, even when a link adds ?utm_campaign=...
        alternates: { canonical: path },
        // setting openGraph here replaces the root's, image included, so name the image again
        // (drawn by src/app/opengraph-image.tsx)
        openGraph: { title: `${title} · Flash`, description, url: path, siteName: "Flash", type: "website", images: "/opengraph-image" },
        robots: { index: true, follow: true },
    };
}
