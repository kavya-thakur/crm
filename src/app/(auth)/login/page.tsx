"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

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
        <main className="flex min-h-screen items-center justify-center px-5 py-12">
            <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8">
                <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
                <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>

                <form
                    onSubmit={handleSubmit((values) => loginMutation.mutate(values))}
                    className="mt-6 space-y-4"
                >
                    <div>
                        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@company.com"
                            aria-invalid={!!errors.email}
                            {...register("email")}
                            className="h-9 w-full rounded-md border border-line px-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
                        />
                        {errors.email && (
                            <p className="mt-1 text-sm text-danger">{errors.email.message}</p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
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
                                className="h-9 w-full rounded-md border border-line px-3 pr-10 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
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
                        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                            {serverError ?? "Something went wrong. Please try again."}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loginMutation.isPending}
                        className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                    >
                        {loginMutation.isPending && <Spinner size={16} />}
                        {loginMutation.isPending ? "Signing in..." : "Sign in"}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-muted">
                    New here?{" "}
                    <Link href="/register" className="font-medium text-ink hover:underline">
                        Create a workspace
                    </Link>
                </p>
            </div>
        </main>
    );
}
