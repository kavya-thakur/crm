import Link from "next/link";

import { LegalPage } from "../components/LegalPage";
import { pageMetadata } from "../metadata";

export const metadata = pageMetadata("/privacy", "Privacy policy", "What Flash stores, why, and what we never do with it.");

export default function PrivacyPage() {
    return (
        <LegalPage title="Privacy policy" updated="2 November 2026">
            <p>
                Flash is a CRM: you and your team keep your leads, deals and customers in it. This page explains, in plain words, what we store, why we
                store it, and what we never do with it.
            </p>

            <h2>What we store</h2>
            <ul>
                <li>
                    <strong>Your account:</strong> your name, your email and your password. The password is hashed with bcrypt, so nobody, including us,
                    can read it.
                </li>
                <li>
                    <strong>Your workspace:</strong> everything your team adds, such as leads, contacts, deals, notes, tasks, activities and custom fields,
                    along with who created or changed each record and when. That history is the timeline you see on every record.
                </li>
                <li>
                    <strong>Web form enquiries:</strong> when someone fills in a form you&apos;ve put on your website, we store what they typed and create a
                    lead in your workspace.
                </li>
                <li>
                    <strong>Files you import:</strong> the rows of a CSV you upload become records in your workspace.
                </li>
            </ul>

            <h2>Why we store it</h2>
            <p>Only to run Flash for you: to sign you in, show your team its records, send its notifications and reminders, and keep your history.</p>

            <h2>What we never do</h2>
            <ul>
                <li>We don&apos;t sell your data or share it with advertisers.</li>
                <li>We don&apos;t run ads or ad trackers, and we don&apos;t use third-party analytics.</li>
                <li>We don&apos;t look at your workspace&apos;s records unless you ask us to help with something.</li>
            </ul>

            <h2>Your workspace is sealed off</h2>
            <p>
                Every workspace&apos;s data is kept apart from every other workspace&apos;s, and each request is checked against the workspace of the person
                making it. Inside a workspace, roles decide who can see and change what.
            </p>

            <h2>Cookies and your browser</h2>
            <ul>
                <li>
                    <strong>One sign-in cookie</strong> keeps you logged in. Scripts on the page can&apos;t read it, and it expires after 24 hours or when you
                    log out.
                </li>
                <li>
                    <strong>Your browser</strong> remembers a few conveniences on your own device: your recent searches, your filters and the last page you
                    were on.
                </li>
            </ul>

            <h2>Your address and spam protection</h2>
            <p>
                To stop password guessing and spam, we count sign-in attempts and web form submissions per IP address. These counts are deleted
                automatically within 15 minutes.
            </p>

            <h2>Your rights</h2>
            <ul>
                <li>You can export your leads, contacts and deals to a CSV file at any time.</li>
                <li>You can correct or delete records in your workspace yourself.</li>
                <li>
                    To have your account or your whole workspace deleted, contact us and we&apos;ll do it. Deleted data is gone from Flash for good.
                </li>
            </ul>

            <h2>Changes to this page</h2>
            <p>If we change how we handle your data, we&apos;ll update this page and the date at the top.</p>

            <h2>Contact</h2>
            <p>
                Questions about your data? Write to us through the form on our <Link href="/demo">Book a demo</Link> page.
            </p>
        </LegalPage>
    );
}
