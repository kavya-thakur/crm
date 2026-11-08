"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { IconArrowRight, IconMailCheck } from "@tabler/icons-react";

import { Spinner } from "@/components/Loader";
import { api, errorMessage } from "@/lib/api/client";

// "Forgot password?": an email with a link to choose a new one
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");

    const send = useMutation({
        mutationFn: () => api.post<{ message: string }>("/auth/forgot-password", { email: email.trim() }),
    });

    if (send.isSuccess) {
        return (
            <>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#4a38f5]/10 text-[#4a38f5]">
                    <IconMailCheck size={24} />
                </span>
                <h1 className="mt-5 text-[32px] leading-tight font-light tracking-[-0.03em] text-[#1c1c1c]">Check your inbox</h1>
                <p className="mt-3 text-[15px] text-[#1c1c1c]/55">{send.data.data.message} Not there? Look in spam, or try again in a minute.</p>
                <Link href="/login" className="mt-8 inline-block text-[14px] font-medium text-[#4a38f5] hover:underline">
                    ← Back to sign in
                </Link>
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
