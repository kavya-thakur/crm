"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ErrorState";

// Catches anything that breaks while a page is rendering; the sidebar keeps working around it
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return <ErrorState title="This page ran into a problem" error={error} onRetry={retry} />;
}
