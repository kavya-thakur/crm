"use client";

import { useEffect } from "react";
import Link from "next/link";

import { ErrorState } from "@/components/ErrorState";
import { LogoMark } from "@/components/Logo";

// Catches a crash on the pages outside the app (landing, login, sign up, onboarding, a receipt);
// the app's own pages have theirs in (dashboard)/error.tsx, which keeps the sidebar
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col bg-app px-6 py-6">
            <Link href="/" aria-label="Flash home" className="inline-flex items-center gap-2.5 self-start">
                <LogoMark size={30} />
                <span className="text-[19px] font-semibold tracking-[-0.045em]">Flash</span>
            </Link>
            <ErrorState title="This page ran into a problem" error={error} onRetry={retry} />
        </div>
    );
}
