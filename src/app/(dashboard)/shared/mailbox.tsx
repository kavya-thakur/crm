"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBrandGoogleFilled, IconCircleCheckFilled } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

/*
 * Connecting the team's mailbox (Settings > Workspace > Team email), the one every email to a lead
 * goes out from. Admins only. "Connect with Google": Gmail (or Google Workspace), sent through Gmail's
 * API, which works where mail ports are blocked. The app-password form (SMTP) was taken off this
 * screen on 2026-11-11 because Render's free plan blocks SMTP; mailboxes connected that way still
 * send (src/lib/emails/send.ts), and PUT /api/workspace/email-account still accepts one.
 */

// a full page visit, not a fetch: Google's page opens in this tab, then comes back here
const GOOGLE_CONNECT = "/api/workspace/email-account/google";

interface EmailAccount {
    email: string;
    // empty for a Gmail connected with Google
    host: string | null;
    port: number | null;
    createdAt: string;
}

// The team mailbox (sending from…, Change, Disconnect), or the button to connect one
export function MailboxSettings({ demo }: { demo: boolean }) {
    const queryClient = useQueryClient();
    const endpoint = "/workspace/email-account";
    const router = useRouter();
    const googleResult = useSearchParams().get("google");

    // back from Google: ?google=connected, or what went wrong; said once, then taken off the address
    useEffect(() => {
        if (!googleResult) return;
        if (googleResult === "connected") toast.success("Gmail connected");
        else toast.error(googleResult);
        router.replace(window.location.pathname);
    }, [googleResult, router]);

    const accountQuery = useQuery({
        queryKey: ["emailAccount"],
        queryFn: () => api.get<{ data: EmailAccount | null }>(endpoint).then((res) => res.data.data),
        enabled: !demo,
    });

    const disconnect = useMutation({
        mutationFn: () => api.delete(endpoint),
        onSuccess: () => {
            toast.success("Email disconnected");
            queryClient.invalidateQueries({ queryKey: ["emailAccount"] });
            // the Emails tab reads "sends from" with the templates
            queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    if (demo) {
        return <p className="rounded-lg bg-app px-3 py-2 text-muted">The demo workspace never sends real emails, so there&apos;s nothing to connect here.</p>;
    }

    if (accountQuery.isPending) return <Spinner size={16} />;
    const account = accountQuery.data;

    if (!account) {
        return (
            <div className="flex flex-col gap-2">
                <a href={GOOGLE_CONNECT} className="flex h-9 w-fit items-center gap-2 rounded-lg border border-line px-3 font-medium hover:bg-fill">
                    <IconBrandGoogleFilled size={16} />
                    Connect with Google
                </a>
                <p className="text-sm text-faint">Works with Gmail and Google Workspace accounts.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
            <IconCircleCheckFilled size={18} className="text-success" />
            <span className="min-w-0 flex-1">
                Sending from <span className="font-medium">{account.email}</span>
                <span className="text-faint"> · {account.host ?? "connected with Google"}</span>
            </span>
            {/* another Google account replaces this one */}
            <a href={GOOGLE_CONNECT} className="flex h-8 items-center rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                Change
            </a>
            <button
                type="button"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-60"
            >
                Disconnect
            </button>
        </div>
    );
}
