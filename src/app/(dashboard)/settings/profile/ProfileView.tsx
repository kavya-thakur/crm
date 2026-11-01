"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
                <h1 className="font-semibold">Profile</h1>
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
