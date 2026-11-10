"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { IconArrowRight, IconMailCheck } from "@tabler/icons-react";

import { Spinner } from "@/components/Loader";
import { api, errorMessage } from "@/lib/api/client";

// how long before the link can be sent again (the server also allows 5 an hour)
const RESEND_AFTER = 60;

// "Forgot password?": an email with a link to choose a new one
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    // sent at least once: the "check your inbox" screen stays up while it's sent again
    const [sent, setSent] = useState(false);
    const [sentAgain, setSentAgain] = useState(false);
    // seconds until "Send again" works
    const [wait, setWait] = useState(0);

    const send = useMutation({
        mutationFn: () => api.post<{ message: string }>("/auth/forgot-password", { email: email.trim() }),
        onSuccess: () => {
            setSentAgain(sent);
            setSent(true);
            setWait(RESEND_AFTER);
        },
    });

    // the countdown, a second at a time
    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((left) => left - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    if (sent) {
        return (
            <>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#4a38f5]/10 text-[#4a38f5]">
                    <IconMailCheck size={24} />
                </span>
                <h1 className="mt-5 text-[32px] leading-tight font-light tracking-[-0.03em] text-[#1c1c1c]">Check your inbox</h1>
                <p className="mt-3 text-[15px] text-[#1c1c1c]/55">
                    If an account uses <span className="font-medium text-[#1c1c1c]">{email.trim()}</span>, a link to choose a new password is on its way. It
                    works for an hour. Not there? Look in your spam folder.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button
                        type="button"
                        onClick={() => send.mutate()}
                        disabled={wait > 0 || send.isPending}
                        className="flex h-11 items-center gap-2 rounded-full border border-[#1c1c1c]/10 px-5 text-[14px] font-medium text-[#1c1c1c] transition-colors hover:border-[#4a38f5] hover:bg-[#4a38f5]/5 disabled:border-[#1c1c1c]/10 disabled:bg-transparent disabled:text-[#1c1c1c]/40"
                    >
                        {send.isPending && <Spinner size={14} />}
                        {wait > 0 ? `Send again in 0:${String(wait).padStart(2, "0")}` : "Send again"}
                    </button>
                    {sentAgain && !send.isPending && !send.isError && <span className="text-[14px] text-success">Sent again</span>}
                </div>
                {send.isError && (
                    <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                        {errorMessage(send.error)}
                    </p>
                )}

                <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-medium">
                    <button
                        type="button"
                        onClick={() => {
                            setSent(false);
                            setSentAgain(false);
                            setWait(0);
                            send.reset();
                        }}
                        className="text-[#1c1c1c]/55 hover:text-[#1c1c1c]"
                    >
                        Use a different email
                    </button>
                    <Link href="/login" className="text-[#4a38f5] hover:underline">
                        ← Back to sign in
                    </Link>
                </div>
            </>
        );
    }

    return (
        <>
            <h1 className="font-(family-name:--font-aleo) text-[40px] leading-[1.05] font-light tracking-[-0.03em] text-[#1c1c1c]">
                Forgot your <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">password?</span>
            </h1>
            <p className="mt-3 text-[15px] text-[#1c1c1c]/55">Enter your email and we&apos;ll send you a link to choose a new one.</p>

            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (email.trim()) send.mutate();
                }}
                className="mt-9 space-y-4"
            >
                <div>
                    <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@company.com"
                        className="h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]"
                    />
                </div>

                {send.isError && (
                    <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                        {errorMessage(send.error)}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={send.isPending || !email.trim()}
                    className="group !mt-7 flex h-12 w-full items-center justify-between rounded-full bg-[#1c1c1c] pr-1.5 pl-5 text-[15px] font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
                >
                    {send.isPending ? "Sending..." : "Send me a link"}
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#4a38f5]">
                        {send.isPending ? <Spinner size={16} /> : <IconArrowRight size={16} className="transition-transform duration-300 group-hover:-rotate-45" />}
                    </span>
                </button>
            </form>

            <p className="mt-8 text-center text-[14px] text-[#1c1c1c]/55">
                Remembered it?{" "}
                <Link href="/login" className="font-medium text-[#4a38f5] hover:underline">
                    Sign in
                </Link>
            </p>
        </>
    );
}
