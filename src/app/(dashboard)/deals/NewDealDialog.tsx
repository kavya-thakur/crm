"use client";

import { useEffect } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconCalendar,
    IconCurrencyRupee,
    IconFileDescription,
    IconPercentage,
    IconProgress,
    IconUser,
    IconUserCircle,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { toast } from "@/components/Toast";
import { Select } from "@/components/Select";
import { createDealSchema } from "@/lib/validations/deals";
import { FormFieldRow, FormIdentityHeader, FormSection, RecordFormShell } from "../shared/FullPageForm";
import { CustomFieldsFormSection, useCustomFields } from "../shared/customFields";
import { StageLabel, refreshDeals, type Deal, type PipelineStage } from "./shared";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

interface LeadOption {
    id: number;
    name: string;
}
interface AgentOption {
    id: number;
    name: string;
}
interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

interface NewDealDialogProps {
    open: boolean;
    canAssign: boolean;
    // linking a lead lists the leads, which needs lead:read
    canLinkLead: boolean;
    onClose: () => void;
    onCreated: (deal: Deal) => void;
}

export default function NewDealDialog({ open, ...props }: NewDealDialogProps) {
    if (!open) return null;
    return <NewDealForm {...props} />;
}

function NewDealForm({ canAssign, canLinkLead, onClose, onCreated }: Omit<NewDealDialogProps, "open">) {
    const queryClient = useQueryClient();
    const {
        register,
        control,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(createDealSchema),
        defaultValues: {
            title: "",
            amount: 0,
            probability: 0,
            pipelineStageId: undefined,
            leadId: null,
            assignedToId: undefined,
            expectedCloseDate: null,
            description: "",
        },
    });

    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () => api.get<OptionsResponse<PipelineStage>>("/pipeline-stages").then((res) => res.data.data),
    });

    const leadsQuery = useQuery({
        queryKey: ["leads", "deal-options"],
        queryFn: () =>
            api
                .get<OptionsResponse<LeadOption>>("/leads", { params: { page: 1, limit: 100, sortBy: "name", sortOrder: "asc" } })
                .then((res) => res.data.data),
        enabled: canLinkLead,
    });

    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<OptionsResponse<AgentOption>>("/agents").then((res) => res.data.data),
        enabled: canAssign,
    });

    const customFieldsQuery = useCustomFields("deal");

    // Defaults to the first stage once it loads, same as Lead's stage picker
    useEffect(() => {
        if (stagesQuery.data?.length) setValue("pipelineStageId", stagesQuery.data[0].id);
    }, [stagesQuery.data, setValue]);

    const create = useMutation({
        mutationFn: (values: {
            title: string;
            amount: number;
            probability: number;
            pipelineStageId: number;
            leadId?: number | null;
            assignedToId?: number | null;
            expectedCloseDate?: string | null;
            description?: string | null;
            customFields?: Record<string, unknown>;
        }) =>
            api
                .post<{ data: Deal }>("/deals", {
                    ...values,
                    amount: Number(values.amount),
                    probability: Number(values.probability),
                    pipelineStageId: Number(values.pipelineStageId),
                    leadId: values.leadId ? Number(values.leadId) : null,
                    // without the picker, leave it out: the deal is then the creator's own
                    ...(canAssign && { assignedToId: values.assignedToId ? Number(values.assignedToId) : null }),
                    expectedCloseDate: values.expectedCloseDate ? new Date(values.expectedCloseDate).toISOString() : null,
                    description: values.description || null,
                })
                .then((res) => res.data.data),
        onSuccess: async (deal) => {
            toast.success("Deal created");
            await refreshDeals(queryClient);
            onCreated(deal);
        },
    });

    // only the lists this person may load count (a disabled query stays "pending" forever)
    const loadingOptions = stagesQuery.isPending || (canLinkLead && leadsQuery.isPending) || (canAssign && agentsQuery.isPending);
    const optionsError = stagesQuery.error || (canLinkLead && leadsQuery.error) || (canAssign && agentsQuery.error);

    return (
        <RecordFormShell
            icon={IconCurrencyRupee}
            entityLabel="Deals"
            noun="deal"
            formId="new-deal-form"
            onCancel={onClose}
            onSubmit={handleSubmit((values) => create.mutate(values))}
            submitDisabled={create.isPending || loadingOptions || !stagesQuery.data?.length}
        >
            {optionsError && (
                <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    {errorMessage(optionsError)}
                </p>
            )}

            <FormIdentityHeader placeholder="Deal name *" error={errors.title?.message} registerProps={register("title")} />

            <FormSection title="Deal Details">
                <FormFieldRow icon={IconCurrencyRupee} label="Amount (₹)">
                    <input type="number" min="0" step="0.01" {...register("amount", { valueAsNumber: true })} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconPercentage} label="Probability">
                    <input type="number" min="0" max="100" {...register("probability", { valueAsNumber: true })} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconProgress} label="Stage" required>
                    <Controller
                        name="pipelineStageId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                disabled={loadingOptions || !stagesQuery.data?.length}
                                value={field.value !== undefined ? String(field.value) : undefined}
                                onChange={(value) => field.onChange(value === undefined ? undefined : Number(value))}
                                placeholder="Select..."
                                options={(stagesQuery.data ?? []).map((stage) => ({
                                    value: String(stage.id),
                                    label: stage.name,
                                    render: <StageLabel stage={stage} />,
                                }))}
                            />
                        )}
                    />
                </FormFieldRow>

                <FormFieldRow icon={IconCalendar} label="Close date">
                    <input
                        type="date"
                        {...register("expectedCloseDate", {
                            setValueAs: (value) => (value ? new Date(`${value}T12:00:00`).toISOString() : null),
                        })}
                        className={inputClassName}
                    />
                </FormFieldRow>
            </FormSection>

            <FormSection title="Relations">
                {canLinkLead && (
                    <FormFieldRow icon={IconUser} label="Lead">
                        <Controller
                            name="leadId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    disabled={loadingOptions}
                                    value={field.value ? String(field.value) : undefined}
                                    onChange={(value) => field.onChange(value === undefined ? null : Number(value))}
                                    placeholder="No lead linked"
                                    options={leadsQuery.data?.map((lead) => ({ value: String(lead.id), label: lead.name })) ?? []}
                                />
                            )}
                        />
                    </FormFieldRow>
                )}

                {canAssign && (
                    <FormFieldRow icon={IconUserCircle} label="Agent">
                        <Controller
                            name="assignedToId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    disabled={loadingOptions}
                                    value={field.value ? String(field.value) : undefined}
                                    onChange={(value) => field.onChange(value === undefined ? null : Number(value))}
                                    placeholder="Unassigned"
                                    options={agentsQuery.data?.map((agent) => ({ value: String(agent.id), label: agent.name })) ?? []}
                                />
                            )}
                        />
                    </FormFieldRow>
                )}
            </FormSection>

            <FormSection title="Description">
                <FormFieldRow icon={IconFileDescription} label="Notes">
                    <textarea
                        rows={3}
                        placeholder="Add details about this deal..."
                        {...register("description")}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </FormFieldRow>
            </FormSection>

            <CustomFieldsFormSection
                fields={customFieldsQuery.data ?? []}
                register={register}
                control={control as Control<any>}
                agents={agentsQuery.data}
            />

            {create.isError && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
        </RecordFormShell>
    );
}
