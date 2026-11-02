"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { IconArrowRight, IconEye, IconEyeOff } from "@tabler/icons-react";

import { Spinner } from "@/components/Loader";
import { api } from "@/lib/api/client";
import { registerSchema, type RegisterFormValues } from "@/lib/validations/auth";

export default function RegisterPage() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
    });

    const registerMutation = useMutation({
        mutationFn: (values: RegisterFormValues) => api.post("/auth/register", values),
        // The API sets the auth cookie, so the user is already signed in here
        onSuccess: () => router.replace("/dashboard"),
    });

    // e.g. "Email is already registered" from the API
    const serverError = axios.isAxiosError(registerMutation.error)
        ? registerMutation.error.response?.data?.message
        : null;

    return (
        <>
            <h1 className="font-(family-name:--font-aleo) text-[40px] leading-[1.05] font-light tracking-[-0.03em] text-[#1c1c1c]">
                Create your <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">workspace</span>
            </h1>
            <p className="mt-3 text-[15px] text-[#1c1c1c]/55">Set up your organization and admin account</p>

            <form
                onSubmit={handleSubmit((values) => registerMutation.mutate(values))}
                className="mt-9 space-y-4"
            >
                <div>
                    <label htmlFor="organizationName" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        Organization name
                    </label>
                    <input
                        id="organizationName"
                        type="text"
                        autoComplete="organization"
                        placeholder="Acme Inc."
                        aria-invalid={!!errors.organizationName}
                        {...register("organizationName")}
                        className="h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]"
                    />
                    {errors.organizationName && (
                        <p className="mt-1 text-sm text-danger">{errors.organizationName.message}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-[#1c1c1c]/70">
                        Your name
                    </label>
                    <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        placeholder="Jane Doe"
                        aria-invalid={!!errors.name}
                        {...register("name")}
                        className="h-11 w-full rounded-xl border border-[#1c1c1c]/10 bg-[#fafafa] px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-[#1c1c1c]/30 focus:border-[#4a38f5] focus:bg-white focus:shadow-[0_0_0_4px_rgb(74_56_245/0.1)]"
                    />
                    {errors.name && (
                        <p className="mt-1 text-sm text-danger">{errors.name.message}</p>
                    )}
                </div>

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
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
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

                {registerMutation.isError && (
                    <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                        {serverError ?? "Something went wrong. Please try again."}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={registerMutation.isPending}
                    className="group !mt-7 flex h-12 w-full items-center justify-between rounded-full bg-[#1c1c1c] pr-1.5 pl-5 text-[15px] font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60"
                >
                    {registerMutation.isPending ? "Creating workspace..." : "Create workspace"}
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#4a38f5]">
                        {registerMutation.isPending ? <Spinner size={16} /> : <IconArrowRight size={16} className="transition-transform duration-300 group-hover:-rotate-45" />}
                    </span>
                </button>
            </form>

            <p className="mt-8 text-center text-[14px] text-[#1c1c1c]/55">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-[#4a38f5] hover:underline">
                    Sign in
                </Link>
            </p>
        </>
    );
}
