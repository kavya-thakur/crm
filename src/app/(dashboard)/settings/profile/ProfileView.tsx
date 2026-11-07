"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheckFilled } from "@tabler/icons-react";
import type { z } from "zod";

import { api, errorMessage } from "@/lib/api/client";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validations/auth";
import { Avatar } from "@/components/Avatar";
import { SectionIcon } from "@/components/SectionIcon";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

interface Profile {
    name: string;
    email: string;
    role: string;
    workspace: string;
    memberSince: string;
    demo: boolean;
}

const INPUT =
    "h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft aria-invalid:border-danger";
const SAVE_BUTTON =
    "flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60";

export default function ProfileView({ profile }: { profile: Profile }) {
    const memberSince = new Date(profile.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="profile" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Profile</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-8">
                    {/* who you are, at a glance */}
                    <div className="flex items-center gap-4">
                        <Avatar name={profile.name} size="lg" />
                        <div className="min-w-0">
                            <h2 className="truncate text-[17px] leading-6 font-semibold tracking-[-0.01em]">{profile.name}</h2>
                            <p className="truncate text-muted">
                                {profile.role} at {profile.workspace} · since {memberSince}
                            </p>
                        </div>
                    </div>

                    <NameSection name={profile.name} />

                    <Section title="Email" description="You sign in with this address. Ask an admin if it needs to change.">
                        <input value={profile.email} readOnly aria-label="Email" className={`${INPUT} bg-paper text-muted`} />
                    </Section>

                    <EmailAccountSection signInEmail={profile.email} demo={profile.demo} />

                    <PasswordSection />
                </div>
            </div>
        </div>
    );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-0.5 mb-3 text-muted">{description}</p>
            {children}
        </section>
    );
}

function NameSection({ name }: { name: string }) {
    const router = useRouter();
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isDirty },
    } = useForm({
        resolver: zodResolver(updateProfileSchema),
        defaultValues: { name },
    });

    const save = useMutation({
        mutationFn: (values: z.infer<typeof updateProfileSchema>) => api.patch<{ data: { name: string } }>("/me", values),
        onSuccess: (res) => {
            toast.success("Name updated");
            reset({ name: res.data.data.name });
            // the sidebar and header are server-rendered, so ask for them again with the new name
            router.refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <Section title="Name" description="How you appear to your team on records, notes and tasks.">
            <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))} className="flex items-start gap-2">
                <div className="flex-1">
                    <input aria-label="Name" aria-invalid={!!errors.name} {...register("name")} className={INPUT} />
                    {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
                </div>
                <button type="submit" disabled={!isDirty || save.isPending} className={SAVE_BUTTON}>
                    {save.isPending && <Spinner size={14} />}
                    Save
                </button>
            </form>
        </Section>
    );
}

function PasswordSection() {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: { currentPassword: "", newPassword: "" },
    });

    const change = useMutation({
        mutationFn: (values: z.infer<typeof changePasswordSchema>) => api.patch("/me/password", values),
        onSuccess: () => {
            toast.success("Password changed");
            reset();
        },
    });

    return (
        <Section title="Password" description="Use at least 8 characters. You'll need your current password to change it.">
            <form noValidate onSubmit={handleSubmit((values) => change.mutate(values))} className="flex max-w-sm flex-col gap-3">
                <div>
                    <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-muted">
                        Current password
                    </label>
                    <input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        aria-invalid={!!errors.currentPassword}
                        {...register("currentPassword")}
                        className={INPUT}
                    />
                    {errors.currentPassword && <p className="mt-1 text-sm text-danger">{errors.currentPassword.message}</p>}
                </div>

                <div>
                    <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-muted">
                        New password
                    </label>
                    <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={!!errors.newPassword}
                        {...register("newPassword")}
                        className={INPUT}
                    />
                    {errors.newPassword && <p className="mt-1 text-sm text-danger">{errors.newPassword.message}</p>}
                </div>

                {change.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(change.error)}
                    </p>
                )}

                <button type="submit" disabled={change.isPending} className={`${SAVE_BUTTON} self-start`}>
                    {change.isPending && <Spinner size={14} />}
                    Change password
                </button>
            </form>
        </Section>
    );
}

interface EmailAccount {
    email: string;
    host: string;
    port: number;
    createdAt: string;
}

// The mailbox your emails from Flash go out through: your own address, so replies come to you
function EmailAccountSection({ signInEmail, demo }: { signInEmail: string; demo: boolean }) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);

    const accountQuery = useQuery({
        queryKey: ["emailAccount"],
        queryFn: () => api.get<{ data: EmailAccount | null }>("/me/email-account").then((res) => res.data.data),
        enabled: !demo,
    });

    // the Emails tab reads "sends from" with the templates
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["emailAccount"] });
        queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
    };

    const disconnect = useMutation({
        mutationFn: () => api.delete("/me/email-account"),
        onSuccess: () => {
            toast.success("Email disconnected");
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const description = "Emails you send from Flash, by hand or by an automation, go out from this address, so replies land in your own inbox.";

    if (demo) {
        return (
            <Section title="Sending email" description={description}>
                <p className="rounded-lg bg-app px-3 py-2 text-muted">The demo workspace never sends real emails, so there&apos;s nothing to connect here.</p>
            </Section>
        );
    }

    const account = accountQuery.data;

    return (
        <Section title="Sending email" description={description}>
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
                    defaults={account ?? { email: signInEmail, host: "smtp.gmail.com", port: 465 }}
                    onCancel={account ? () => setEditing(false) : undefined}
                    onConnected={() => {
                        setEditing(false);
                        refresh();
                    }}
                />
            )}
        </Section>
    );
}

// Address and app password; the server and port only for mail that isn't Gmail
function ConnectEmailForm({
    defaults,
    onCancel,
    onConnected,
}: {
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
        mutationFn: () => api.put("/me/email-account", { email: email.trim(), password, host: host.trim(), port }),
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
                    Your email address
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
