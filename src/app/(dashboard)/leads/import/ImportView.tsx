"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { IconArrowLeft, IconChevronRight, IconDownload, IconFileSpreadsheet, IconUpload } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils/format";
import { guessField, LEAD_IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/validations/imports";
import { SectionIcon } from "@/components/SectionIcon";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Loader";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "@/components/Toast";
import { useCustomFields, type AgentOption } from "../../shared/customFields";
import { StageLabel, type LeadSource, type LeadStage } from "../shared";
import { CheckSummary, choicesForApi, ProblemCard, SkippedNote, ValueMatches, type CheckResult, type Fixes, type ValueChoices } from "./ImportCheck";

type Row = Record<string, string>;

interface ParsedFile {
    file: File;
    headers: string[];
    rows: Row[];
}

interface ImportSummary {
    id: number;
    fileName: string;
    status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
    total: number;
    processed: number;
    created: number;
    skipped: number;
    failed: number;
    error: string | null;
    createdAt: string;
    user: { id: number; name: string };
    // why rows weren't added, grouped (only when one import is opened)
    problemGroups?: { reason: string; count: number; names: string[] }[];
}

/**
 * Leads > Import: bring a spreadsheet in. Three steps: pick a CSV, say which column is which
 * (Flash guesses), then watch it import. The importing happens in the background (a BullMQ
 * job in Redis, see docs/QUEUES.md), so the page can be left; a notification says when it's done.
 */
export default function ImportView({ canAssign }: { canAssign: boolean }) {
    const router = useRouter();
    const jobId = Number(useSearchParams().get("job")) || null;
    const [parsed, setParsed] = useState<ParsedFile | null>(null);

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <SectionIcon section="leads" size="md" />
                <Link href="/leads" className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Leads
                </Link>
                <span className="text-faint">/</span>
                <h1 className="px-1 font-semibold">Import</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
                    {jobId ? (
                        <JobProgress id={jobId} onAnother={() => router.replace("/leads/import")} />
                    ) : parsed ? (
                        <MapColumns
                            parsed={parsed}
                            canAssign={canAssign}
                            onBack={() => setParsed(null)}
                            onStarted={(id) => {
                                setParsed(null);
                                router.replace(`/leads/import?job=${id}`);
                            }}
                        />
                    ) : (
                        <PickFile onPicked={setParsed} />
                    )}

                    <RecentImports currentId={jobId} onOpen={(id) => router.replace(`/leads/import?job=${id}`)} />
                </div>
            </div>
        </div>
    );
}

// Step 1: choose (or drop) a CSV. It's read right here in the browser, for the next step.
function PickFile({ onPicked }: { onPicked: (parsed: ParsedFile) => void }) {
    const [problem, setProblem] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [dragging, setDragging] = useState(false);

    function read(file: File | undefined) {
        if (!file) return;
        setProblem(null);
        if (!/\.csv$/i.test(file.name)) return setProblem("Choose a .csv file. In Excel or Google Sheets: File → Download (or Save as) → CSV.");
        if (file.size > MAX_IMPORT_BYTES) return setProblem("That file is over 5 MB. Split it into smaller files and import them one by one.");

        setReading(true);
        Papa.parse<Row>(file, {
            header: true,
            skipEmptyLines: "greedy",
            complete: (result) => {
                setReading(false);
                const headers = (result.meta.fields ?? []).filter((header) => header.trim() !== "");
                if (headers.length === 0 || result.data.length === 0) return setProblem("That file has no rows to import.");
                if (result.data.length > MAX_IMPORT_ROWS) return setProblem(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it and import the parts one by one.`);
                onPicked({ file, headers, rows: result.data });
            },
            error: () => {
                setReading(false);
                setProblem("Couldn't read that file. Is it a CSV?");
            },
        });
    }

    return (
        <section>
            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Import leads from a spreadsheet</h2>
            <p className="mt-1 text-muted">
                Bring in your leads from Excel, Google Sheets or another CRM. Each person gets a contact too, and anyone who&apos;s already an open
                lead isn&apos;t added twice.
            </p>

            <label
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    read(event.dataTransfer.files[0]);
                }}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                    dragging ? "border-accent bg-accent-faint" : "border-line-strong hover:border-accent hover:bg-paper"
                }`}
            >
                {reading ? <Spinner size={22} /> : <IconUpload size={26} className="text-accent" />}
                <span className="font-medium text-ink">{reading ? "Reading the file…" : "Drop a CSV file here, or click to choose one"}</span>
                <span className="text-sm text-faint">Up to 5 MB, about 50,000 rows</span>
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => read(event.target.files?.[0])} />
            </label>

            {problem && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {problem}
                </p>
            )}

            {/* built for this workspace: its stages, sources, people and every lead custom field */}
            <a href="/api/imports/sample" download className="mt-3 flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
                <IconDownload size={14} />
                Download a sample CSV with your fields
            </a>
        </section>
    );
}

// Step 2: which column is which, what rows get when they don't say, and a preview
function MapColumns({ parsed, canAssign, onBack, onStarted }: { parsed: ParsedFile; canAssign: boolean; onBack: () => void; onStarted: (id: number) => void }) {
    const queryClient = useQueryClient();
    const { file, headers, rows } = parsed;

    const stagesQuery = useQuery({ queryKey: ["leadStage"], queryFn: () => api.get<{ data: LeadStage[] }>("/lead-stages").then((res) => res.data.data) });
    const sourcesQuery = useQuery({ queryKey: ["leadSource"], queryFn: () => api.get<{ data: LeadSource[] }>("/lead-sources").then((res) => res.data.data) });
    const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: () => api.get<{ data: AgentOption[] }>("/agents").then((res) => res.data.data), enabled: canAssign });
    const customFieldsQuery = useCustomFields("lead");
    // every lead custom field can be filled in; an Agent field takes a teammate's name or email
    const customFields = useMemo(() => customFieldsQuery.data ?? [], [customFieldsQuery.data]);

    // Flash's guesses (each field to one column at most), then whatever's been changed by hand
    const guessed = useMemo(() => {
        const used = new Set<string>();
        return Object.fromEntries(
            headers.map((header) => {
                const field = guessField(header, customFields);
                if (!field || used.has(field)) return [header, ""];
                used.add(field);
                return [header, field];
            }),
        );
    }, [headers, customFields]);
    const [changed, setChanged] = useState<Record<string, string>>({});
    const mapping: Record<string, string> = { ...guessed, ...changed };

    // a field goes to one column: picking it here takes it off any other
    function choose(header: string, field: string) {
        const next = { ...changed, [header]: field };
        if (field) for (const other of headers) if (other !== header && mapping[other] === field) next[other] = "";
        setChanged(next);
    }

    const [stageId, setStageId] = useState<number | undefined>();
    const [sourceId, setSourceId] = useState<number | null>(null);
    // undefined = the person importing
    const [ownerId, setOwnerId] = useState<number | null | undefined>();
    const firstOpenStage = stagesQuery.data?.find((stage) => !stage.isConverted && !stage.isLost);

    const fieldOptions = [
        { value: "", label: "Don't import" },
        ...LEAD_IMPORT_FIELDS.map((field) => ({ value: field.id, label: field.label })),
        ...customFields.map((field) => ({ value: `cf:${field.key}`, label: field.label, render: <span>{field.label} <span className="text-faint">· custom</span></span> })),
    ];
    const labelOf = (field: string) => fieldOptions.find((option) => option.value === field)?.label ?? field;
    const missing = LEAD_IMPORT_FIELDS.filter((field) => field.required && !Object.values(mapping).includes(field.id));
    const mapped = headers.filter((header) => mapping[header]);

    // The screen's fixes: what unmatched values become, and the rows to keep rather than leave out.
    // Every change is checked again on the server (the same rules as the import), half a second on.
    const [valueChoices, setValueChoices] = useState<ValueChoices>({});
    const [fixes, setFixes] = useState<Fixes>({ nameFromPhone: false, leaveEmpty: [] });
    const settings = JSON.stringify({
        mapping,
        defaults: { stageId: stageId ?? firstOpenStage?.id, sourceId, ...(canAssign && { ownerId }), values: choicesForApi(valueChoices), fixes },
    });
    const [checkedSettings, setCheckedSettings] = useState(settings);
    useEffect(() => {
        const timer = setTimeout(() => setCheckedSettings(settings), 500);
        return () => clearTimeout(timer);
    }, [settings]);
    const check = useQuery({
        queryKey: ["import-check", file.name, file.size, file.lastModified, checkedSettings],
        queryFn: () => {
            const form = new FormData();
            form.set("file", file);
            form.set("settings", checkedSettings);
            return api.post<{ data: CheckResult }>("/imports/check", form, { headers: { "Content-Type": "multipart/form-data" } }).then((res) => res.data.data);
        },
        enabled: missing.length === 0 && Boolean(stagesQuery.data),
        placeholderData: keepPreviousData,
    });
    // what the import will do is what was last checked; while a change is being checked, wait
    const upToDate = check.data !== undefined && !check.isFetching && checkedSettings === settings;
    const chooseValue = (field: CheckResult["values"][number], value: string, choice: string) =>
        setValueChoices((current) => ({ ...current, [field.field]: { kind: field.kind, choices: { ...current[field.field]?.choices, [value]: choice } } }));
    const defaultOwner = ownerId === undefined ? "Me" : ownerId === null ? "Nobody" : (agentsQuery.data?.find((agent) => agent.id === ownerId)?.name ?? "the default");
    const defaultFor = (field: string) =>
        field === "owner"
            ? `Default (${defaultOwner})`
            : field === "stage"
              ? `Default (${stagesQuery.data?.find((stage) => stage.id === (stageId ?? firstOpenStage?.id))?.name ?? "first stage"})`
              : field === "source"
                ? `Default (${sourcesQuery.data?.find((source) => source.id === sourceId)?.name ?? "no source"})`
                : "Choose one (or the row is left out)";

    const example = (header: string) => rows.slice(0, 20).map((row) => row[header]?.trim()).find(Boolean) ?? "";

    const start = useMutation({
        mutationFn: () => {
            const form = new FormData();
            form.set("file", file);
            form.set("settings", settings);
            // a file upload, not the JSON the API client sends by default
            return api.post<{ data: ImportSummary }>("/imports", form, { headers: { "Content-Type": "multipart/form-data" } }).then((res) => res.data.data);
        },
        onSuccess: (job) => {
            toast.success("Import started", "You can leave this page; you'll be told when it's done.");
            void queryClient.invalidateQueries({ queryKey: ["imports"] });
            onStarted(job.id);
        },
    });

    return (
        <section>
            <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
                <IconArrowLeft size={14} />
                Choose another file
            </button>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
                <IconFileSpreadsheet size={22} className="shrink-0 text-[#218358]" />
                <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{file.name}</p>
                    <p className="text-sm text-faint">
                        {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} · {headers.length} columns
                    </p>
                </div>
            </div>

            <Step title="Match your columns" hint="Flash guessed where it could. Name and phone are needed for every lead.">
                <div className="overflow-hidden rounded-xl border border-line">
                    {/* on a phone, just the column and where it goes: the example needs the width of a tablet */}
                    <div className="grid grid-cols-[1fr_11rem] gap-3 border-b border-line-light bg-paper px-4 py-2 text-sm font-medium text-faint sm:grid-cols-[1fr_1fr_14rem]">
                        <span>Column in your file</span>
                        <span className="hidden sm:block">Example</span>
                        <span>Goes into</span>
                    </div>
                    {headers.map((header) => (
                        <div key={header} className="grid grid-cols-[1fr_11rem] items-center gap-3 border-b border-line-light px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_1fr_14rem]">
                            <span className="truncate font-medium text-ink">{header}</span>
                            <span className="hidden truncate text-muted sm:block">{example(header) || <span className="text-light">Empty</span>}</span>
                            <Select value={mapping[header] ?? ""} onChange={(value) => choose(header, value ?? "")} options={fieldOptions} placeholder="Don't import" />
                        </div>
                    ))}
                </div>
                {missing.length > 0 && (
                    <p role="alert" className="mt-2 text-sm text-danger">
                        Choose the column with the {missing.map((field) => field.label.toLowerCase()).join(" and the ")}.
                    </p>
                )}
            </Step>

            <Step title="When a row doesn't say" hint="Used when a row's own column is empty or doesn't match one of yours.">
                <div className="grid gap-3 sm:grid-cols-3">
                    <Labelled label="Stage">
                        <Select
                            value={String(stageId ?? firstOpenStage?.id ?? "")}
                            onChange={(value) => setStageId(value ? Number(value) : undefined)}
                            options={(stagesQuery.data ?? []).map((stage) => ({ value: String(stage.id), label: stage.name, render: <StageLabel stage={stage} /> }))}
                            placeholder="First stage"
                        />
                    </Labelled>
                    <Labelled label="Source">
                        <Select
                            value={sourceId ? String(sourceId) : "none"}
                            onChange={(value) => setSourceId(value && value !== "none" ? Number(value) : null)}
                            options={[{ value: "none", label: "No source" }, ...(sourcesQuery.data ?? []).map((source) => ({ value: String(source.id), label: source.name }))]}
                            placeholder="No source"
                        />
                    </Labelled>
                    <Labelled label="Assigned to">
                        {canAssign ? (
                            <Select
                                value={ownerId === undefined ? "me" : ownerId === null ? "none" : String(ownerId)}
                                onChange={(value) => setOwnerId(!value || value === "me" ? undefined : value === "none" ? null : Number(value))}
                                options={[
                                    { value: "me", label: "Me" },
                                    { value: "none", label: "Nobody (unassigned)" },
                                    ...(agentsQuery.data ?? []).map((agent) => ({ value: String(agent.id), label: agent.name })),
                                ]}
                                placeholder="Me"
                            />
                        ) : (
                            <p className="flex h-8 items-center text-ink">Me</p>
                        )}
                    </Labelled>
                </div>

                {!canAssign && headers.some((header) => mapping[header] === "owner") && (
                    <p className="mt-3 text-sm text-faint">You&apos;ll own every lead you import, whatever the file says.</p>
                )}
            </Step>

            {missing.length === 0 && (
                <Step title="Check" hint="Every row, read the way the import will read it. Fix what's needed here: nothing is left out without being shown.">
                    <div className="flex flex-col gap-3">
                        <CheckSummary check={check.data} checking={check.isFetching} />
                        {check.isError && <ErrorState variant="inline" title="Couldn't check the file" error={check.error} onRetry={() => check.refetch()} retrying={check.isFetching} />}
                        {check.data?.problems.map((problem) => (
                            <ProblemCard key={`${problem.code}|${problem.field}`} problem={problem} fixes={fixes} onFixes={setFixes} headers={headers} rows={rows} />
                        ))}
                        {check.data?.values.map((field) => (
                            <ValueMatches
                                key={field.field}
                                field={field}
                                chosen={valueChoices[field.field]?.choices ?? {}}
                                onChoose={(value, choice) => chooseValue(field, value, choice)}
                                defaultLabel={defaultFor(field.field)}
                            />
                        ))}
                        {check.data && <SkippedNote check={check.data} />}
                    </div>
                </Step>
            )}

            {mapped.length > 0 && (
                <Step title="Preview" hint="The first rows, as they'll come in.">
                    <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full min-w-max text-left">
                            <thead>
                                <tr className="border-b border-line-light bg-paper text-sm text-faint">
                                    {mapped.map((header) => (
                                        <th key={header} className="px-3 py-2 font-medium">
                                            {labelOf(mapping[header])}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 3).map((row, index) => (
                                    <tr key={index} className="border-b border-line-light last:border-b-0">
                                        {mapped.map((header) => (
                                            <td key={header} className="max-w-56 truncate px-3 py-2 text-ink">
                                                {row[header] || <span className="text-light">Empty</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Step>
            )}

            {start.isError && (
                <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(start.error)}
                </p>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    type="button"
                    disabled={missing.length > 0 || start.isPending || !upToDate || check.data?.willAdd === 0}
                    onClick={() => start.mutate()}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {(start.isPending || (missing.length === 0 && !upToDate)) && <Spinner size={14} />}
                    {check.data ? `Import ${check.data.willAdd.toLocaleString()} lead${check.data.willAdd === 1 ? "" : "s"}` : "Checking…"}
                </button>
            </div>
        </section>
    );
}

// Step 3: how far it's got, live from the worker (and refetched now and then, just in case)
function JobProgress({ id, onAnother }: { id: number; onAnother: () => void }) {
    const query = useQuery({
        queryKey: ["import", id],
        queryFn: () => api.get<{ data: ImportSummary }>(`/imports/${id}`).then((res) => res.data.data),
        refetchInterval: (current) => (current.state.data && ["QUEUED", "RUNNING"].includes(current.state.data.status) ? 5000 : false),
    });

    if (query.isPending) return <Spinner size={20} />;
    if (query.isError) return <ErrorState title="Couldn't load this import" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;

    const job = query.data;
    const finished = job.status === "DONE" || job.status === "FAILED";
    const share = job.total > 0 ? job.processed / job.total : 0;
    const notAdded = job.skipped + job.failed;

    return (
        <section>
            <div className="flex items-center gap-3">
                <IconFileSpreadsheet size={22} className="shrink-0 text-[#218358]" />
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] leading-6 font-semibold">{job.fileName}</h2>
                    <p className="text-sm text-faint" role="status">
                        {job.status === "QUEUED" && "Waiting its turn…"}
                        {job.status === "RUNNING" && `Importing… ${job.processed.toLocaleString()} of ${job.total.toLocaleString()} rows`}
                        {job.status === "DONE" && `Done · ${job.total.toLocaleString()} rows`}
                        {job.status === "FAILED" && `Stopped: ${job.error ?? "something went wrong"}`}
                    </p>
                </div>
            </div>

            {/* the bar grows by scaling, so it moves smoothly */}
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-fill">
                <div
                    className={`h-full origin-left rounded-full transition-transform duration-500 ease-out ${job.status === "FAILED" ? "bg-danger" : "bg-accent"}`}
                    style={{ transform: `scaleX(${finished ? Math.max(share, job.status === "DONE" ? 1 : 0) : share})` }}
                />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Count label="Added" value={job.created} tone="text-[#218358]" />
                <Count label="Already leads" value={job.skipped} hint="or twice in the file" />
                <Count label="With problems" value={job.failed} tone={job.failed > 0 ? "text-danger" : undefined} />
            </div>

            {!finished && <p className="mt-4 text-sm text-faint">You can leave this page: it carries on in the background, and you&apos;ll get a notification when it&apos;s done.</p>}

            {finished && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Link href="/leads" className="flex h-9 items-center gap-1 rounded-lg bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">
                        View leads
                        <IconChevronRight size={15} />
                    </Link>
                    {notAdded > 0 && (
                        <a href={`/api/imports/${job.id}/problems`} download className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-muted hover:bg-paper hover:text-ink">
                            <IconDownload size={15} />
                            Download the {notAdded.toLocaleString()} row{notAdded === 1 ? "" : "s"} not added
                        </a>
                    )}
                    <button type="button" onClick={onAnother} className="h-9 px-2 font-medium text-muted hover:text-ink">
                        Import another file
                    </button>
                </div>
            )}
            {/* why the rest weren't added, right here; the download has every one of those rows */}
            {finished && job.problemGroups && job.problemGroups.length > 0 && (
                <ul className="mt-5 divide-y divide-line-light overflow-hidden rounded-xl border border-line">
                    {job.problemGroups.map((group) => (
                        <li key={group.reason} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                            <span className="font-medium text-ink">{group.reason}</span>
                            <span className="text-sm text-faint tabular-nums">
                                {group.count.toLocaleString()} {group.count === 1 ? "row" : "rows"}
                            </span>
                            {group.names.length > 0 && <span className="w-full truncate text-sm text-muted">e.g. {group.names.join(", ")}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {finished && notAdded > 0 && (
                <p className="mt-2 text-sm text-faint">The download has each of those rows with its reason in a &quot;Problem&quot; column, to fix and import again.</p>
            )}
        </section>
    );
}

function RecentImports({ currentId, onOpen }: { currentId: number | null; onOpen: (id: number) => void }) {
    const query = useQuery({ queryKey: ["imports"], queryFn: () => api.get<{ data: ImportSummary[] }>("/imports").then((res) => res.data.data) });
    const imports = query.data ?? [];
    if (imports.length === 0) return null;

    const status = { QUEUED: "Waiting", RUNNING: "Importing", DONE: "Done", FAILED: "Stopped" } as const;

    return (
        <section>
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-faint uppercase">Recent imports</h3>
            <ul className="overflow-hidden rounded-xl border border-line">
                {imports.map((item) => (
                    <li key={item.id} className="border-b border-line-light last:border-b-0">
                        <button
                            type="button"
                            onClick={() => onOpen(item.id)}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper ${item.id === currentId ? "bg-accent-faint" : ""}`}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-ink">{item.fileName}</span>
                                <span className="block truncate text-sm text-faint">
                                    {item.user.name} · {timeAgo(item.createdAt)}
                                </span>
                            </span>
                            <span className="shrink-0 text-sm text-muted tabular-nums">
                                {item.created.toLocaleString()} added
                                {item.skipped + item.failed > 0 && ` · ${(item.skipped + item.failed).toLocaleString()} not added`}
                            </span>
                            <span className={`shrink-0 rounded-full px-2 text-sm font-medium ${item.status === "FAILED" ? "bg-danger-soft text-danger" : item.status === "DONE" ? "bg-[#e4f4ea] text-[#218358]" : "bg-accent-soft text-accent"}`}>
                                {status[item.status]}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function Step({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
    return (
        <div className="mt-7">
            <h3 className="font-semibold text-ink">{title}</h3>
            <p className="mb-3 text-sm text-faint">{hint}</p>
            {children}
        </div>
    );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <p className="mb-1 text-sm font-medium text-muted">{label}</p>
            {children}
        </div>
    );
}

function Count({ label, value, tone, hint }: { label: string; value: number; tone?: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-line px-4 py-3">
            <p className="text-sm text-faint">{label}</p>
            <p className={`text-[22px] leading-8 font-semibold tabular-nums ${tone ?? "text-ink"}`}>{value.toLocaleString()}</p>
            {hint && <p className="text-sm text-light">{hint}</p>}
        </div>
    );
}
