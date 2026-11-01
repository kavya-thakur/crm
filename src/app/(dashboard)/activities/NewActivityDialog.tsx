"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { IconCalendarDue, IconCalendarEvent, IconClock, IconFileDescription, IconTag, IconUserCircle, IconUsers } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { createScheduledActivitySchema } from "@/lib/validations/scheduledActivities";
import { FormFieldRow, FormIdentityHeader, FormSection, RecordFormShell } from "../shared/FullPageForm";
import type { AgentOption } from "../shared/customFields";
import { AttendeePicker, DURATION_OPTIONS, TYPE_OPTIONS } from "../shared/activities";
import { fromDateTimeLocal, nextFullHour, toDateTimeLocal, type Activity } from "./shared";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

interface NewActivityDialogProps {
    // only when this user may see the team; without it an activity is simply for yourself
    agents?: AgentOption[];
    onClose: () => void;
    onCreated: (activity: Activity) => void;
}

export default function NewActivityDialog({ agents, onClose, onCreated }: NewActivityDialogProps) {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors },
    } = useForm({
        // the same schema POST /api/activities validates with
        resolver: zodResolver(createScheduledActivitySchema),
        defaultValues: { type: "MEETING" as const, scheduledAt: nextFullHour(), attendeeIds: [] as number[] },
    });

    const create = useMutation({
        mutationFn: (values: unknown) => api.post<{ data: Activity }>("/activities", values).then((res) => res.data.data),
        onSuccess: (activity) => {
            toast.success("Activity created");
            onCreated(activity);
        },
    });

    return (
        <RecordFormShell
            icon={IconCalendarEvent}
            entityLabel="Activities"
            noun="activity"
            formId="new-activity-form"
            hideTabs
            onCancel={onClose}
            onSubmit={handleSubmit((values) => create.mutate(values))}
            submitDisabled={create.isPending}
        >
            <FormIdentityHeader placeholder="Activity title *" error={errors.title?.message} registerProps={register("title")} />

            <FormSection title="Schedule">
                <FormFieldRow icon={IconTag} label="Type" required>
                    <Controller
                        name="type"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onChange={(value) => field.onChange(value)} placeholder="Type" options={TYPE_OPTIONS} />
                        )}
                    />
                </FormFieldRow>

                <FormFieldRow icon={IconCalendarDue} label="When" required>
                    <Controller
                        name="scheduledAt"
                        control={control}
                        render={({ field }) => (
                            <input
                                type="datetime-local"
                                aria-invalid={!!errors.scheduledAt}
                                value={toDateTimeLocal(field.value)}
                                // the form keeps an exact moment, the input shows the viewer's local time
                                onChange={(event) => field.onChange(fromDateTimeLocal(event.target.value))}
                                className={inputClassName}
                            />
                        )}
                    />
                </FormFieldRow>

                <FormFieldRow icon={IconClock} label="Duration">
                    <Controller
                        name="durationMinutes"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ? String(field.value) : ""}
                                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
                                placeholder="No duration"
                                options={DURATION_OPTIONS}
                            />
                        )}
                    />
                </FormFieldRow>
            </FormSection>

            {agents && (
                <FormSection title="People">
                    <FormFieldRow icon={IconUserCircle} label="Assigned to">
                        <Controller
                            name="assignedToId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    // "" = leave it to the API (assigns to you), otherwise an agent id
                                    value={field.value === undefined ? "" : String(field.value)}
                                    onChange={(value) => field.onChange(value ? Number(value) : undefined)}
                                    placeholder="Me"
                                    options={[
                                        { value: "", label: "Me" },
                                        ...agents.map((agent) => ({ value: String(agent.id), label: agent.name })),
                                    ]}
                                />
                            )}
                        />
                    </FormFieldRow>

                    <FormFieldRow icon={IconUsers} label="Tag agents">
                        <Controller
                            name="attendeeIds"
                            control={control}
                            render={({ field }) => <AttendeePicker agents={agents} value={field.value ?? []} onChange={field.onChange} />}
                        />
                    </FormFieldRow>
                </FormSection>
            )}

            <FormSection title="Description">
                <FormFieldRow icon={IconFileDescription} label="Notes">
                    <textarea
                        rows={4}
                        placeholder="What's this about..."
                        {...register("description")}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </FormFieldRow>
            </FormSection>

            {create.isError && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
        </RecordFormShell>
    );
}
