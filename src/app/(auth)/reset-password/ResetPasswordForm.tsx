"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { IconArrowRight, IconEye, IconEyeOff } from "@tabler/icons-react";

import { Spinner } from "@/components/Loader";
import { api, errorMessage } from "@/lib/api/client";

const input =
    "h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 pr-10 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]";

// The new password, twice, so a typo doesn't lock you out again
export default function ResetPasswordForm({ token }: { token: string }) {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [again, setAgain] = useState("");
    const [show, setShow] = useState(false);

    const tooShort = password.length > 0 && password.length < 8;
    const different = again.length > 0 && again !== password;

    const save = useMutation({
        mutationFn: () => api.post("/auth/reset-password", { token, password }),
        onSuccess: () => router.replace("/login?reset=1"),
    });

    return (
        <>
            <h1 className="font-(family-name:--font-aleo) text-[40px] leading-[1.05] font-light tracking-[-0.03em] text-[#1c1c1c]">
                Choose a new <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">password</span>
            </h1>
            <p className="mt-3 text-[15px] text-[#1c1c1c]/55">At least 8 characters. You&apos;ll sign in with it straight after.</p>

            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (password.length >= 8 && password === again) save.mutate();
                }}
                className="mt-9 space-y-4"
            >
                <div>
                    <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        New password
                    </label>
                    <div className="relative">
                        <input
                            id="password"
                            type={show ? "text" : "password"}
                            autoComplete="new-password"
                            autoFocus
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            aria-invalid={tooShort}
                            className={input}
                        />
                        <button
                            type="button"
                            onClick={() => setShow(!show)}
                            aria-label={show ? "Hide password" : "Show password"}
                            className="absolute inset-y-0 right-0 px-3 text-muted hover:text-ink"
                        >
                            {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                    </div>
                    {tooShort && <p className="mt-1 text-sm text-danger">At least 8 characters</p>}
                </div>

                <div>
                    <label htmlFor="again" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        Type it again
                    </label>
                    <input
                        id="again"
                        type={show ? "text" : "password"}
                        autoComplete="new-password"
                        value={again}
                        onChange={(event) => setAgain(event.target.value)}
                        aria-invalid={different}
                        className={input}
                    />
                    {different && <p className="mt-1 text-sm text-danger">The two don&apos;t match</p>}
                </div>

                {save.isError && (
                    <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                        {errorMessage(save.error)}{" "}
                        <Link href="/forgot-password" className="font-medium underline">
                            Get a new link
                        </Link>
                    </p>
                )}

                <button
                    type="submit"
                    disabled={save.isPending || password.length < 8 || password !== again}
                    className="group !mt-7 flex h-12 w-full items-center justify-between rounded-full bg-[#1c1c1c] pr-1.5 pl-5 text-[15px] font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
                >
                    {save.isPending ? "Saving..." : "Save new password"}
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#4a38f5]">
                        {save.isPending ? <Spinner size={16} /> : <IconArrowRight size={16} className="transition-transform duration-300 group-hover:-rotate-45" />}
                    </span>
                </button>
            </form>
        </>
    );
}
