
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ProductPage } from "./ProductPage";
import { pageMetadata } from "../metadata";

export const metadata = pageMetadata("/product", "Product", "Everything Flash does: web forms, CSV import and integrations, a Kanban pipeline with duplicate checks, tasks and reminders, email with open tracking, a live team dashboard, and bulk actions on thousands of records.");

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
