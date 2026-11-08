import type { Metadata } from "next";
import Link from "next/link";

import { findReset } from "@/lib/auth/passwordReset";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
    title: "Choose a new password",
};

// From the "Forgot password?" email. A link that's expired or used says so straight away,
// rather than after the new password is typed.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams;
    const usable = token && token.length <= 200 ? await findReset(token) : null;

    if (!token || !usable) {
        return (
            <>
                <h1 className="text-[32px] leading-tight font-light tracking-[-0.03em] text-[#1c1c1c]">This link has expired</h1>
                <p className="mt-3 text-[15px] text-[#1c1c1c]/55">
                    Password links work once, for an hour, and only the newest one works. Ask for a new link and use it straight away.
                </p>
                <Link
                    href="/forgot-password"
                    className="mt-8 flex h-12 items-center justify-center rounded-full bg-[#1c1c1c] text-[15px] font-medium text-white hover:bg-[#333333]"
                >
                    Send me a new link
                </Link>
            </>
        );
    }

    return <ResetPasswordForm token={token} />;
}
