import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ProductPage } from "./ProductPage";

export const metadata: Metadata = {
    title: "Product",
    description: "A closer look at Flash: leads as a list or a Kanban board, duplicate checks, a pipeline with lost reasons, reminders, mentions and a live dashboard.",
    robots: { index: true, follow: true },
};

export default async function Page() {
    const user = await getCurrentUser();

    return (
        <div className="bg-white text-[#1c1c1c]">
            <Nav loggedIn={!!user} primaryHref={user ? "/dashboard" : "/register"} primaryLabel={user ? "Go to your workspace" : "Get started"} resting="white" />
            <main>
                <ProductPage loggedIn={!!user} />
            </main>
            <Footer />
        </div>
    );
}
