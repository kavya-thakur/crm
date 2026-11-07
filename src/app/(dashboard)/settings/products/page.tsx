import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import ProductsView from "./ProductsView";

export const metadata: Metadata = {
    title: "Products",
};

// The catalogue is workspace setup, like the currency, so it shares that permission
export default async function ProductsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "workspace:manage")) {
        redirect("/leads");
    }

    return <ProductsView />;
}
