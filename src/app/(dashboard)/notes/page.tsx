import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import NotesView from "./NotesView";

export const metadata: Metadata = {
    title: "Notes",
};

// /api/notes itself only returns notes from whichever of lead/deal/contact this user
// can read; `entities` just tells the board which columns to draw.
export default async function NotesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const entities = (["lead", "deal", "contact"] as const).filter((entity) => hasPermission(user, `${entity}:read`));

    return <NotesView meId={user.id} entities={[...entities]} />;
}
