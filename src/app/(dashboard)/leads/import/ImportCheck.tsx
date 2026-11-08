"use client";

import type { ReactNode } from "react";
import Papa from "papaparse";
import { IconAlertTriangle, IconCircleCheckFilled, IconCopy, IconDownload } from "@tabler/icons-react";

import { Select } from "@/components/Select";
import { Spinner } from "@/components/Loader";

/*
 * The import screen's check (from /api/imports/check, the same rules as the import itself): what
 * will be added, what's skipped as already a lead, the problems grouped with a fix for each, and
 * the values in the file that match nothing in Flash, to match. Nothing is dropped without being
 * shown here first, and every row that can be saved has a way to be.
 */

type Row = Record<string, string>;

export interface CheckResult {
    total: number;
    willAdd: number;
    skipped: { alreadyLeads: number; inFile: number; samples: { line: number; name: string; reason: string }[] };
    problems: {
        code: "missing-phone" | "bad-phone" | "missing-name" | "bad-name" | "bad-email" | "unknown-value" | "bad-value";
        field: string;
        label: string;
        message: string;
        count: number;
        lines: number[];
        samples: { line: number; name: string; value: string }[];
    }[];
    values: {
        field: string;
        label: string;
        column: string;
        // what a choice is: an id (a teammate, stage or source) or a dropdown option itself
        kind: "id" | "option";
        // what "nothing" is called for this field, if it can be nothing
        empty: string | null;
        options: { value: string; label: string }[];
        items: { value: string; count: number }[];
    }[];
}

// What's been chosen for each field's unmatched values: "" = the default, "none" = nothing, or a choice
export type ValueChoices = Record<string, { kind: "id" | "option"; choices: Record<string, string> }>;

export interface Fixes {
    nameFromPhone: boolean;
    leaveEmpty: string[];
}

// The choices as the API takes them: keyed by the value in lowercase, ids as numbers, nothing as null
export function choicesForApi(values: ValueChoices) {
    return Object.fromEntries(
        Object.entries(values).map(([field, { kind, choices }]) => [
            field,
            Object.fromEntries(
                Object.entries(choices)
                    .filter(([, choice]) => choice !== "")
                    .map(([value, choice]) => [value.trim().toLowerCase(), choice === "none" ? null : kind === "id" ? Number(choice) : choice]),
            ),
        ]),
    );
}

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

// "Ready": what happens with every row, at a glance
export function CheckSummary({ check, checking }: { check: CheckResult | undefined; checking: boolean }) {
    if (!check) {
        return (
            <p className="flex items-center gap-2 text-muted">
                <Spinner size={14} /> Checking every row…
            </p>
        );
    }
    const leftOut = check.problems.reduce((sum, problem) => sum + problem.count, 0);
    const skipped = check.skipped.alreadyLeads + check.skipped.inFile;
    return (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${leftOut ? "border-[#ffd19a] bg-[#fff7ed]" : "border-success/20 bg-success-soft"}`}>
            <span className="flex items-center gap-1.5 font-semibold text-ink">
                <IconCircleCheckFilled size={18} className="text-success" />
                {plural(check.willAdd, "lead")} will be added
            </span>
            {skipped > 0 && <span className="text-muted">{plural(skipped, "row")} already leads, skipped</span>}
            {leftOut > 0 && <span className="font-medium text-[#ab4800]">{plural(leftOut, "row")} need a choice below, or they&apos;ll be left out</span>}
            {checking && <Spinner size={14} />}
        </div>
    );
}

// One kind of problem: how many rows, a few of them, and its fix (or why there isn't one)
export function ProblemCard({
    problem,
    fixes,
    onFixes,
    headers,
    rows,
}: {
    problem: CheckResult["problems"][number];
    fixes: Fixes;
    onFixes: (fixes: Fixes) => void;
    headers: string[];
    rows: Row[];
}) {
    const leaveEmpty = (field: string, on: boolean) => onFixes({ ...fixes, leaveEmpty: on ? [...fixes.leaveEmpty, field] : fixes.leaveEmpty.filter((item) => item !== field) });
    const title: Record<CheckResult["problems"][number]["code"], string> = {
        "missing-phone": "No phone number",
        "bad-phone": "Phone number isn't valid",
        "missing-name": "No name",
        "bad-name": "Name isn't valid",
        "bad-email": "Email isn't valid",
        "unknown-value": `${problem.label}: values not in Flash`,
        "bad-value": `${problem.label}: values that don't fit`,
    };

    let fix: ReactNode;
    if (problem.code === "missing-name") {
        fix = <Toggle checked={fixes.nameFromPhone} onChange={(on) => onFixes({ ...fixes, nameFromPhone: on })} label="Use the phone number as the name (you can rename them later)" />;
    } else if (problem.code === "bad-email" || problem.code === "bad-value") {
        fix = <Toggle checked={fixes.leaveEmpty.includes(problem.field)} onChange={(on) => leaveEmpty(problem.field, on)} label={`Import these without the ${problem.label.toLowerCase()}`} />;
    } else if (problem.code === "unknown-value") {
        fix = <p className="text-sm text-muted">Match each value to one in Flash below, or leave it empty.</p>;
    } else {
        // a lead can't be saved without a valid phone (or a name that fits): the file needs fixing
        fix = (
            <p className="text-sm text-muted">
                These can&apos;t be imported: every lead needs {problem.code === "bad-name" ? "a name of up to 200 characters" : "a real phone number"}. Download them, fix them in
                your spreadsheet, and import that file afterwards.
            </p>
        );
    }

    // these rows, as a CSV of their own (from the file already read in the browser)
    function download() {
        const csv = Papa.unparse(
            problem.lines.map((line) => rows[line - 2]),
            { columns: headers },
        );
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        link.download = `${title[problem.code].replace(/[^\w ]+/g, "").trim().replace(/ +/g, "-").toLowerCase()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    return (
        <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-light bg-paper px-4 py-2">
                <IconAlertTriangle size={16} className="shrink-0 text-[#ef5f00]" />
                <p className="font-medium text-ink">{title[problem.code]}</p>
                <span className="text-sm text-faint">{plural(problem.count, "row")}</span>
                <button type="button" onClick={download} className="ml-auto flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
                    <IconDownload size={14} /> These rows
                </button>
            </div>
            <ul className="divide-y divide-line-light text-sm">
                {problem.samples.map((sample) => (
                    <li key={sample.line} className="flex gap-3 px-4 py-1.5">
                        <span className="w-16 shrink-0 text-faint tabular-nums">Line {sample.line}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{sample.name || <span className="text-light">No name</span>}</span>
                        {sample.value && <span className="max-w-[45%] truncate text-muted">&ldquo;{sample.value}&rdquo;</span>}
                    </li>
                ))}
                {problem.count > problem.samples.length && <li className="px-4 py-1.5 text-faint">and {plural(problem.count - problem.samples.length, "more row")}</li>}
            </ul>
            <div className="border-t border-line-light px-4 py-2.5">{fix}</div>
        </div>
    );
}

// The rows that are already leads (or twice in the file): skipped, so nobody gets a second lead
export function SkippedNote({ check }: { check: CheckResult }) {
    const { alreadyLeads, inFile, samples } = check.skipped;
    if (alreadyLeads + inFile === 0) return null;
    return (
        <div className="rounded-xl border border-line px-4 py-3">
            <p className="flex items-center gap-2 font-medium text-ink">
                <IconCopy size={16} className="text-faint" />
                {[alreadyLeads > 0 && `${plural(alreadyLeads, "person", "people")} already open leads`, inFile > 0 && `${plural(inFile, "row")} repeat someone earlier in the file`]
                    .filter(Boolean)
                    .join(", ")}
            </p>
            <p className="mt-0.5 text-sm text-muted">They&apos;re skipped, so nobody gets a second open lead. {samples.length > 0 && `For example: ${samples.slice(0, 3).map((sample) => `${sample.name} (line ${sample.line})`).join(", ")}.`}</p>
        </div>
    );
}

// Shown at a time; a file with more unmatched values than this has the rest use the default
const VALUES_SHOWN = 50;

// One field's values that match nothing in Flash, most rows first, each with what it becomes
export function ValueMatches({
    field,
    chosen,
    onChoose,
    defaultLabel,
}: {
    field: CheckResult["values"][number];
    chosen: Record<string, string>;
    onChoose: (value: string, choice: string) => void;
    // what a value left alone becomes: the default (Assigned to, Stage, Source), or a problem
    defaultLabel: string;
}) {
    const options = [{ value: "", label: defaultLabel }, ...(field.empty ? [{ value: "none", label: field.empty }] : []), ...field.options];
    return (
        <div className="overflow-hidden rounded-xl border border-line">
            <p className="border-b border-line-light bg-paper px-4 py-2 text-sm font-medium text-faint">
                {field.label} · {plural(field.items.length, "value")} in &ldquo;{field.column}&rdquo; not in Flash
            </p>
            {field.items.slice(0, VALUES_SHOWN).map(({ value, count }) => (
                <div key={value} className="grid grid-cols-[1fr_11rem] items-center gap-3 border-b border-line-light px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_14rem]">
                    <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">{value}</span>
                        <span className="text-faint"> · {plural(count, "row")}</span>
                    </span>
                    <Select value={chosen[value] ?? ""} onChange={(choice) => onChoose(value, choice ?? "")} options={options} placeholder={defaultLabel} searchable />
                </div>
            ))}
            {field.items.length > VALUES_SHOWN && (
                <p className="px-4 py-2 text-sm text-faint">{plural(field.items.length - VALUES_SHOWN, "more value")} (the ones on the fewest rows) stay as &ldquo;{defaultLabel}&rdquo;.</p>
            )}
        </div>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-accent" />
            {label}
        </label>
    );
}
