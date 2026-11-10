import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import LandingPage from "./LandingPage";
import { pageMetadata } from "./metadata";
import { TRIAL_DAYS } from "@/lib/billing/plans";

export const metadata = pageMetadata(
    "/",
    "The CRM for sales teams",
    `Flash keeps every lead, deal and follow-up in one place: web forms and CSV import, duplicate checks, a Kanban pipeline, reminders and a live dashboard. Free for ${TRIAL_DAYS} days, then one price for your whole team.`,
);

export default async function Home() {
    const user = await getCurrentUser();

    return <LandingPage loggedIn={!!user} />;
}
