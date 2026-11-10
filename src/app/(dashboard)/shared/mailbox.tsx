"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheckFilled } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

/*
 * Connecting the team's mailbox (Settings > Workspace > Team email), the one every email to a lead
 * goes out from. Admins only. The server logs in before saving it.
 */

const INPUT =
    "h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft aria-invalid:border-danger";
const SAVE_BUTTON =
    "flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60";

interface EmailAccount {
    email: string;
    host: string;
    port: number;
    createdAt: string;
}

// A mailbox's status (sending from…, Change, Disconnect), or the form to connect it
export function MailboxSettings({ demo }: { demo: boolean }) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const endpoint = "/workspace/email-account";

    const accountQuery = useQuery({
        queryKey: ["emailAccount"],
        queryFn: () => api.get<{ data: EmailAccount | null }>(endpoint).then((res) => res.data.data),
        enabled: !demo,
    });

    // the Emails tab reads "sends from" with the templates
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["emailAccount"] });
        queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
    };

    const disconnect = useMutation({
        mutationFn: () => api.delete(endpoint),
        onSuccess: () => {
            toast.success("Email disconnected");
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    if (demo) {
        return <p className="rounded-lg bg-app px-3 py-2 text-muted">The demo workspace never sends real emails, so there&apos;s nothing to connect here.</p>;
    }

    const account = accountQuery.data;

    return (
        <>
            {accountQuery.isPending ? (
                <Spinner size={16} />
            ) : account && !editing ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <IconCircleCheckFilled size={18} className="text-success" />
                    <span className="min-w-0 flex-1">
                        Sending from <span className="font-medium">{account.email}</span>
                        <span className="text-faint"> · {account.host}</span>
                    </span>
                    <button type="button" onClick={() => setEditing(true)} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                        Change
                    </button>
                    <button
                        type="button"
                        onClick={() => disconnect.mutate()}
                        disabled={disconnect.isPending}
                        className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-60"
                    >
                        Disconnect
                    </button>
                </div>
            ) : (
                <ConnectEmailForm
                    endpoint={endpoint}
                    defaults={account ?? { email: "", host: "smtp.gmail.com", port: 465 }}
                    onCancel={account ? () => setEditing(false) : undefined}
                    onConnected={() => {
                        setEditing(false);
                        refresh();
                    }}
                />
            )}
        </>
    );
}

// Address and app password; the server and port only for mail that isn't Gmail
function ConnectEmailForm({
    endpoint,
    defaults,
    onCancel,
    onConnected,
}: {
    endpoint: string;
    defaults: { email: string; host: string; port: number };
    onCancel?: () => void;
    onConnected: () => void;
}) {
    const [email, setEmail] = useState(defaults.email);
    const [password, setPassword] = useState("");
    const [host, setHost] = useState(defaults.host);
    const [port, setPort] = useState(defaults.port);
    const isGmail = host === "smtp.gmail.com";

    // the server logs in to the mailbox before saving, so this can take a few seconds
    const connect = useMutation({
        mutationFn: () => api.put(endpoint, { email: email.trim(), password, host: host.trim(), port }),
        onSuccess: () => {
            toast.success("Email connected");
            onConnected();
        },
    });

    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                connect.mutate();
            }}
            className="flex max-w-md flex-col gap-3"
        >
            <div>
                <label htmlFor="mailbox-email" className="mb-1 block text-sm font-medium text-muted">
                    Email address
                </label>
                <input id="mailbox-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT} />
            </div>

            <div>
                <label htmlFor="mailbox-password" className="mb-1 block text-sm font-medium text-muted">
                    App password
                </label>
                <input
                    id="mailbox-password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="abcd efgh ijkl mnop"
                    className={INPUT}
                />
                {isGmail ? (
                    <p className="mt-1 text-sm text-faint">
                        Not your Gmail password. Turn on 2-Step Verification, then make one at{" "}
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            myaccount.google.com/apppasswords
                        </a>{" "}
                        and paste it here. You can revoke it there any time.
                    </p>
                ) : (
                    <p className="mt-1 text-sm text-faint">Your mail provider&apos;s app password (or SMTP password).</p>
                )}
            </div>

            {/* open from the start when the mailbox being changed isn't Gmail */}
            <details open={defaults.host !== "smtp.gmail.com" || undefined} className="text-sm">
                <summary className="cursor-pointer text-muted">Not Gmail? Mail server settings</summary>
                <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
                    <input value={host} onChange={(event) => setHost(event.target.value)} aria-label="Mail server" placeholder="smtp.zoho.in" className={INPUT} />
                    <select value={port} onChange={(event) => setPort(Number(event.target.value))} aria-label="Port" className={INPUT}>
                        <option value={465}>465 (SSL)</option>
                        <option value={587}>587 (TLS)</option>
                    </select>
                </div>
                <p className="mt-1 text-faint">Outlook: smtp.office365.com, 587 · Zoho: smtp.zoho.in, 465 · Hostinger: smtp.hostinger.com, 465</p>
            </details>

            {connect.isError && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(connect.error)}
                </p>
            )}

            <div className="flex gap-2">
                <button type="submit" disabled={connect.isPending || !email.trim() || !password.trim()} className={SAVE_BUTTON}>
                    {connect.isPending && <Spinner size={14} />}
                    {connect.isPending ? "Checking..." : "Connect"}
                </button>
                {onCancel && (
                    <button type="button" onClick={onCancel} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}
