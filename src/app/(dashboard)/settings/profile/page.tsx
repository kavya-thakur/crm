import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import ProfileView from "./ProfileView";

export const metadata: Metadata = {
    title: "Profile",
};

// Everyone has a profile, so there's no permission check, only sign-in
export default async function ProfilePage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <ProfileView
            profile={{
                name: user.name,
                email: user.email,
                role: user.role.name,
                workspace: user.organization.name,
                memberSince: user.createdAt.toISOString(),
            }}
        />
    );
}
