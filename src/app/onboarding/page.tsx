import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import Onboarding from "./Onboarding";

export const metadata: Metadata = { title: "Set up your workspace" };

// Only for someone who just signed up; everyone else goes where they'd normally land
export default async function OnboardingPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }
    if (!user.needsOnboarding || user.actingAsId) {
        redirect("/dashboard");
    }

    return <Onboarding />;
}
