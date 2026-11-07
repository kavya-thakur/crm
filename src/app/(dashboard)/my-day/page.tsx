import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import MyDayView from "./MyDayView";

export const metadata: Metadata = {
    title: "My day",
};

// Everyone has one: it only ever shows their own work
export default async function MyDayPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return <MyDayView firstName={user.name.split(" ")[0]} />;
}
