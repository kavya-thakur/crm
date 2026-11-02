import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import DemoPage from "./DemoPage";

export const metadata: Metadata = {
    title: "Book a demo",
    description: "See Flash in action: a 30-minute walkthrough shaped around how your team sells.",
    robots: { index: true, follow: true },
};

// Requests from this page become leads in Flash's own workspace, through the same web
// form feature customers use: DEMO_FORM_KEY is the key of a form made in Settings > Web forms
export default async function BookDemoPage() {
    const user = await getCurrentUser();

    return <DemoPage loggedIn={!!user} formKey={process.env.DEMO_FORM_KEY ?? null} />;
}
