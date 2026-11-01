import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import LandingPage from "./LandingPage";

// The root layout sets robots: noindex (every other page is a private
// workspace behind login) — this one page is the public marketing site.
export const metadata: Metadata = {
    robots: { index: true, follow: true },
};

export default async function Home() {
    const user = await getCurrentUser();

    return <LandingPage loggedIn={!!user} />;
}
