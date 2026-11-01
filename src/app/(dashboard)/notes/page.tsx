import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import NotesView from "./NotesView";

export const metadata: Metadata = {
    title: "Notes",
};

// No `can` props here — /api/notes itself only returns notes from whichever
// of lead/deal/contact this user can read, same as every per-record notes route.
export default async function NotesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return <NotesView meId={user.id} />;
}
