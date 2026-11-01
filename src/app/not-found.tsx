"use client";

import Link from "next/link";
import { IconMapOff } from "@tabler/icons-react";

import { ErrorState } from "@/components/ErrorState";

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col">
            <ErrorState
                icon={<IconMapOff size={22} />}
                title="Page not found"
                message="The page you're looking for doesn't exist or has moved."
                action={
                    <Link
                        href="/"
                        className="flex h-8 items-center rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
                    >
                        Back to home
                    </Link>
                }
            />
        </main>
    );
}
