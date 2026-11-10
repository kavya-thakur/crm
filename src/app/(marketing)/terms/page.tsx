import Link from "next/link";

import { LegalPage } from "../components/LegalPage";
import { pageMetadata } from "../metadata";
import { TRIAL_DAYS } from "@/lib/billing/plans";

export const metadata = pageMetadata("/terms", "Terms of service", "The rules for using Flash, in plain words.");

export default function TermsPage() {
    return (
        <LegalPage title="Terms of service" updated="2 November 2026">
            <p>
                These terms are the agreement between you and Flash when you use it. We&apos;ve kept them short and plain. By creating a workspace or
                signing in, you agree to them.
            </p>

            <h2>Your account</h2>
            <ul>
                <li>Keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
                <li>
                    The person who creates a workspace is its admin. Admins invite people, set their roles and decide what each role can see and do.
                </li>
            </ul>

            <h2>Your data is yours</h2>
            <p>
                Everything your team puts into Flash belongs to you. You let us store and process it only so we can run Flash for you, as described in
                our <Link href="/privacy">privacy policy</Link>. You can export your leads, contacts and deals to CSV at any time.
            </p>

            <h2>Using Flash fairly</h2>
            <p>Please don&apos;t:</p>
            <ul>
                <li>store data you have no right to keep, or use Flash to send spam;</li>
                <li>try to reach another workspace&apos;s data or get around roles and permissions;</li>
                <li>overload Flash on purpose, or try to break, copy or resell it.</li>
            </ul>

            <h2>Plans and payment</h2>
            <ul>
                <li>Every new workspace gets a free trial with every feature, for {TRIAL_DAYS} days. No card is needed.</li>
                <li>
                    After the trial, the Pro plan is one price for the whole workspace, whatever the number of people in it. You can pay monthly, or
                    yearly for two months free. Prices are on our <Link href="/pricing">pricing page</Link>.
                </li>
                <li>
                    When a trial or a paid period ends without a new payment, the workspace is locked until a plan is chosen. Nothing is deleted: your
                    data stays exactly as you left it.
                </li>
                <li>Your plan stays active until the end of the period you&apos;ve paid for. It doesn&apos;t renew by itself.</li>
                <li>If we ever change prices, we&apos;ll tell you before your next bill.</li>
            </ul>

            <h2>Availability</h2>
            <p>
                We work hard to keep Flash fast and running, but we can&apos;t promise it will never be down or never have a bug. Flash is provided as
                it is, and we&apos;re not liable for lost business or indirect losses caused by using it.
            </p>

            <h2>Ending</h2>
            <p>
                You can stop using Flash whenever you like. Export your data first, then ask us to delete your workspace. We may suspend a workspace
                that breaks these terms, and we&apos;ll tell you why.
            </p>

            <h2>Changes to these terms</h2>
            <p>If we change these terms, we&apos;ll update this page and the date at the top. Using Flash after a change means you accept it.</p>

            <h2>Contact</h2>
            <p>
                Questions about these terms? Write to us through the form on our <Link href="/demo">Book a demo</Link> page.
            </p>
        </LegalPage>
    );
}
