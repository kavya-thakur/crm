"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { IconArrowRight, IconEye, IconEyeOff } from "@tabler/icons-react";

import { Spinner } from "@/components/Loader";
import { api } from "@/lib/api/client";
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth";

export default function LoginPage() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
    });

    const loginMutation = useMutation({
        mutationFn: (values: LoginFormValues) => api.post("/auth/login", values),
        // The API sets the auth cookie, so the user is signed in here
        onSuccess: () => router.replace("/dashboard"),
    });

    // e.g. "Invalid email or password" from the API
    const serverError = axios.isAxiosError(loginMutation.error)
        ? loginMutation.error.response?.data?.message
        : null;

    return (
        <>
            <h1 className="font-(family-name:--font-aleo) text-[40px] leading-[1.05] font-light tracking-[-0.03em] text-[#1c1c1c]">
                Welcome <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">back</span>
            </h1>
            <p className="mt-3 text-[15px] text-[#1c1c1c]/55">Sign in to your workspace</p>

            <form
                onSubmit={handleSubmit((values) => loginMutation.mutate(values))}
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
                        placeholder="you@company.com"
                        aria-invalid={!!errors.email}
                        {...register("email")}
                        className="h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]"
                    />
                    {errors.email && (
                        <p className="mt-1 text-sm text-danger">{errors.email.message}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        Password
                    </label>
                    <div className="relative">
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="Your password"
                            aria-invalid={!!errors.password}
                            {...register("password")}
                            className="h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 pr-10 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute inset-y-0 right-0 px-3 text-muted hover:text-ink"
                        >
                            {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                    </div>
                    {errors.password && (
                        <p className="mt-1 text-sm text-danger">{errors.password.message}</p>
                    )}
                </div>

                {loginMutation.isError && (
                    <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                        {serverError ?? "Something went wrong. Please try again."}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loginMutation.isPending}
                    className="group !mt-7 flex h-12 w-full items-center justify-between rounded-full bg-[#1c1c1c] pr-1.5 pl-5 text-[15px] font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
                >
                    {loginMutation.isPending ? "Signing in..." : "Sign in"}
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#4a38f5]">
                        {loginMutation.isPending ? <Spinner size={16} /> : <IconArrowRight size={16} className="transition-transform duration-300 group-hover:-rotate-45" />}
                    </span>
                </button>
            </form>

            {/* One click into the demo workspace, no sign-up (see /api/auth/demo) */}
            <div className="mt-8">
                <p className="flex items-center gap-3 text-[13px] text-[#1c1c1c]/45 before:h-px before:flex-1 before:bg-[#1c1c1c]/10 after:h-px after:flex-1 after:bg-[#1c1c1c]/10">
                    or explore the live demo
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <a href="/api/auth/demo?as=manager" className="flex h-11 flex-col items-center justify-center rounded-xl border border-[#1c1c1c]/10 text-[14px] font-medium text-[#1c1c1c] transition-colors hover:border-[#4a38f5] hover:bg-[#4a38f5]/5">
                        As a manager
                    </a>
                    <a href="/api/auth/demo?as=agent" className="flex h-11 flex-col items-center justify-center rounded-xl border border-[#1c1c1c]/10 text-[14px] font-medium text-[#1c1c1c] transition-colors hover:border-[#4a38f5] hover:bg-[#4a38f5]/5">
                        As a sales agent
                    </a>
                </div>
                <Suspense>
                    <DemoNotice />
                </Suspense>
            </div>

            <p className="mt-8 text-center text-[14px] text-[#1c1c1c]/55">
                New here?{" "}
                <Link href="/register" className="font-medium text-[#4a38f5] hover:underline">
                    Create a workspace
                </Link>
            </p>
        </>
    );
}

// Why the demo didn't open, when /api/auth/demo sends someone back here
function DemoNotice() {
    const reason = useSearchParams().get("demo");
    if (!reason) return null;

    return (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {reason === "busy" ? "That's a lot of demo visits from here. Please wait a few minutes." : "The demo isn't available right now. Please try again a little later."}
        </p>
    );
}
