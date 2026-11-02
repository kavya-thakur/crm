"use client";

import { useEffect, useState, type ComponentType, type DragEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck, IconCircleX, IconDotsVertical, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { StageBadge } from "@/components/StageBadge";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { STAGE_COLOR_PALETTE } from "@/lib/settings/stageColors";

/**
 * twenty.com's way of editing a list of options: every option in one card, renamed in
 * place, recoloured from a named colour menu, dragged into order, then saved all at once
 * (or thrown away with Cancel). Used for pipeline stages, lead stages and lead sources.
 */

type FlagKey = "isWon" | "isConverted" | "isLost";

// A yes/no an option can carry, like "Won stage". Each option has at most one.
export interface Flag {
    key: FlagKey;
    /** "won", "converted", "lost" */
    word: string;
    tone: "green" | "red";
}

interface SavedOption {
    id: number;
    name: string;
    color: string;
    isWon?: boolean;
    isConverted?: boolean;
    isLost?: boolean;
}

// One row being edited. `key` stays stable while the row is renamed or moved.
interface Row {
    key: string;
    id?: number;
    name: string;
    color: string;
    flag: FlagKey | null;
}

export interface OptionListConfig {
    /** "Lead stages" */
    title: string;
    description: string;
    /** "/lead-stages" */
    endpoint: string;
    queryKey: string;
    flags: Flag[];
    /** what the preview card is a mock of: "Lead" / "Deal" */
    recordLabel: string;
    recordIcon: ComponentType<{ size?: number; className?: string }>;
    /** "Stage" / "Source" */
    fieldLabel: string;
}

function toRows(options: SavedOption[], flags: Flag[]): Row[] {
    return options.map((option) => ({
        key: `saved-${option.id}`,
        id: option.id,
        name: option.name,
        color: option.color,
        flag: flags.find((flag) => option[flag.key])?.key ?? null,
    }));
}

// What actually gets compared and sent: the edit state minus the bookkeeping key
function payload(rows: Row[], flags: Flag[]) {
    return rows.map((row) => ({
        ...(row.id !== undefined && { id: row.id }),
        name: row.name.trim(),
        color: row.color,
        ...Object.fromEntries(flags.map((flag) => [flag.key, row.flag === flag.key])),
    }));
}

const FLAG_ICONS = { green: IconCircleCheck, red: IconCircleX };
const FLAG_INKS = { green: "text-[#218358]", red: "text-[#ce2c31]" };

export function OptionListEditor({ config }: { config: OptionListConfig }) {
    const queryClient = useQueryClient();

    const optionsQuery = useQuery({
        queryKey: [config.queryKey],
        queryFn: () => api.get<{ data: SavedOption[] }>(config.endpoint).then((res) => res.data.data),
    });

    const savedRows = optionsQuery.data ? toRows(optionsQuery.data, config.flags) : [];
    // The user's unsaved edits; null means "nothing touched, show what's saved"
    const [draft, setDraft] = useState<Row[] | null>(null);
    const rows = draft ?? savedRows;
    const dirty = draft !== null && JSON.stringify(payload(draft, config.flags)) !== JSON.stringify(payload(savedRows, config.flags));

    // Every edit starts from the draft, or from the saved list if this is the first one
    function edit(change: (current: Row[]) => Row[]) {
        setDraft((current) => change(current ?? savedRows));
    }

    // Leaving the page with unsaved edits asks first, like any editor would
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropAt, setDropAt] = useState<number | null>(null);

    const save = useMutation({
        mutationFn: (list: Row[]) =>
            api.put<{ data: SavedOption[] }>(config.endpoint, { options: payload(list, config.flags) }).then((res) => res.data.data),
        onSuccess: (data) => {
            toast.success(`${config.title} saved`);
            queryClient.setQueryData([config.queryKey], data);
            setDraft(null);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    if (optionsQuery.isPending) return <PageLoader label={`Loading ${config.title.toLowerCase()}`} />;
    if (optionsQuery.isError) {
        return (
            <ErrorState
                variant="inline"
                title={`Couldn't load ${config.title.toLowerCase()}`}
                error={optionsQuery.error}
                onRetry={() => optionsQuery.refetch()}
                retrying={optionsQuery.isFetching}
            />
        );
    }

    const blank = rows.some((row) => row.name.trim() === "");
    const names = rows.map((row) => row.name.trim().toLowerCase()).filter(Boolean);
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    const problem = blank ? "Every option needs a name" : duplicate ? `"${duplicate}" is used twice` : null;

    const preview = rows.find((row) => row.key === previewKey) ?? rows[0];

    function update(key: string, change: Partial<Row>) {
        edit((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    }

    function remove(key: string) {
        edit((current) => current.filter((row) => row.key !== key));
    }

    function add() {
        const key = crypto.randomUUID();
        // each new option jumps a few colours round the palette, so neighbours differ
        const color = STAGE_COLOR_PALETTE[(rows.length * 5) % STAGE_COLOR_PALETTE.length].hex;
        edit((current) => [...current, { key, name: `Option ${current.length + 1}`, color, flag: null }]);
        setFocusKey(key);
        setPreviewKey(key);
    }

    // Moves a row so it lands before the row at `target` (target = rows.length means last)
    function moveTo(key: string, target: number) {
        edit((current) => {
            const from = current.findIndex((row) => row.key === key);
            if (from < 0) return current;
            const next = current.filter((row) => row.key !== key);
            next.splice(target > from ? target - 1 : target, 0, current[from]);
            return next;
        });
    }

    function handleDragOver(event: DragEvent<HTMLLIElement>, index: number) {
        if (draggingKey === null) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        // the top half of a row drops above it, the bottom half below it
        setDropAt(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
    }

    function endDrag() {
        setDraggingKey(null);
        setDropAt(null);
    }

    // The handle works from the keyboard too: arrow keys move the row up and down
    function handleKey(event: KeyboardEvent, index: number) {
        if (event.key === "ArrowUp" && index > 0) {
            event.preventDefault();
            moveTo(rows[index].key, index - 1);
        }
        if (event.key === "ArrowDown" && index < rows.length - 1) {
            event.preventDefault();
            moveTo(rows[index].key, index + 2);
        }
    }

    return (
        <div className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            {/* Preview: a mock record showing the option as it will really look */}
            <div className="rounded-t-xl border-b border-line-light bg-paper p-4">
                <p className="mb-2.5 text-xs font-medium text-faint">Preview</p>
                <div className="rounded-lg border border-line bg-surface">
                    <div className="flex h-10 items-center gap-2 border-b border-line-light px-3 font-medium">
                        <config.recordIcon size={15} className="text-faint" />
                        {config.recordLabel}
                    </div>
                    <div className="flex h-11 items-center gap-2 px-3">
                        <span className="w-16 text-sm text-faint">{config.fieldLabel}</span>
                        {preview ? (
                            <StageBadge name={preview.name.trim() || "Untitled"} color={preview.color} />
                        ) : (
                            <span className="text-light">Empty</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-2">
                <p className="px-2 pt-1 pb-2 text-xs font-medium text-faint">Options</p>

                <ul onDrop={(event) => { event.preventDefault(); if (draggingKey !== null && dropAt !== null) moveTo(draggingKey, dropAt); endDrag(); }}>
                    {rows.map((row, index) => {
                        const flag = config.flags.find((item) => item.key === row.flag);
                        const FlagIcon = flag && FLAG_ICONS[flag.tone];

                        return (
                            <li
                                key={row.key}
                                draggable
                                onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    setDraggingKey(row.key);
                                }}
                                onDragEnd={endDrag}
                                onDragOver={(event) => handleDragOver(event, index)}
                                className={`group relative flex h-10 items-center gap-2 rounded-lg px-1 ${draggingKey === row.key ? "opacity-40" : ""}`}
                            >
                                {/* where the dragged row will land */}
                                {draggingKey !== null && dropAt === index && <span aria-hidden className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-accent" />}
                                {draggingKey !== null && dropAt === index + 1 && index === rows.length - 1 && (
                                    <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
                                )}

                                <button
                                    type="button"
                                    aria-label={`Move ${row.name || "option"}: drag, or use the arrow keys`}
                                    onKeyDown={(event) => handleKey(event, index)}
                                    className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-light hover:bg-fill hover:text-muted active:cursor-grabbing"
                                >
                                    <IconGripVertical size={15} />
                                </button>

                                <ColorMenu
                                    color={row.color}
                                    onOpen={() => setPreviewKey(row.key)}
                                    onPick={(color) => {
                                        update(row.key, { color });
                                        setPreviewKey(row.key);
                                    }}
                                />

                                <input
                                    value={row.name}
                                    autoFocus={focusKey === row.key}
                                    maxLength={50}
                                    aria-label="Option name"
                                    aria-invalid={row.name.trim() === ""}
                                    onFocus={(event) => {
                                        setPreviewKey(row.key);
                                        if (focusKey === row.key) event.currentTarget.select();
                                    }}
                                    onChange={(event) => update(row.key, { name: event.target.value })}
                                    onKeyDown={(event) => {
                                        // Enter on the last row adds the next one, like a list in a doc
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            if (index === rows.length - 1) add();
                                        }
                                    }}
                                    className="h-8 min-w-0 flex-1 rounded-md border border-line bg-paper px-2.5 outline-none focus:border-accent focus:bg-surface focus:ring-3 focus:ring-accent-soft aria-invalid:border-danger"
                                />

                                {flag && FlagIcon && (
                                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
                                        <FlagIcon size={15} className={FLAG_INKS[flag.tone]} />
                                        Counts as {flag.word}
                                    </span>
                                )}

                                <Dropdown
                                    align="right"
                                    buttonClassName="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                                    label={
                                        <>
                                            <IconDotsVertical size={15} />
                                            <span className="sr-only">Options for {row.name || "this option"}</span>
                                        </>
                                    }
                                >
                                    {(close) => (
                                        <>
                                            {config.flags.map((item) => {
                                                const Icon = FLAG_ICONS[item.tone];
                                                return (
                                                    <MenuItem
                                                        key={item.key}
                                                        selected={row.flag === item.key}
                                                        onClick={() => {
                                                            update(row.key, { flag: row.flag === item.key ? null : item.key });
                                                            close();
                                                        }}
                                                    >
                                                        <Icon size={15} className={FLAG_INKS[item.tone]} /> Counts as {item.word}
                                                    </MenuItem>
                                                );
                                            })}
                                            {config.flags.length > 0 && <div className="my-1 h-px bg-line-light" />}
                                            <MenuItem
                                                danger
                                                onClick={() => {
                                                    remove(row.key);
                                                    close();
                                                }}
                                            >
                                                <IconTrash size={15} /> Remove option
                                            </MenuItem>
                                        </>
                                    )}
                                </Dropdown>
                            </li>
                        );
                    })}
                </ul>

                <button
                    type="button"
                    onClick={add}
                    className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-muted hover:border-accent hover:bg-accent-faint hover:text-accent"
                >
                    <IconPlus size={14} />
                    Add option
                </button>
            </div>

            {/* the save bar only shows once something has changed */}
            {dirty && (
                <div className="flex items-center gap-2 rounded-b-xl border-t border-line-light bg-paper px-4 py-2.5">
                    <span className={`text-sm ${problem ? "text-danger" : "text-muted"}`}>{problem ?? "You have unsaved changes"}</span>
                    <button
                        type="button"
                        onClick={() => setDraft(null)}
                        disabled={save.isPending}
                        className="ml-auto h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => save.mutate(rows)}
                        disabled={save.isPending || problem !== null}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                    >
                        {save.isPending && <Spinner size={14} />}
                        Save
                    </button>
                </div>
            )}
        </div>
    );
}

// The colour ring at the start of a row, opening twenty.com's named colour menu
function ColorMenu({ color, onOpen, onPick }: { color: string; onOpen: () => void; onPick: (hex: string) => void }) {
    return (
        <Dropdown
            buttonClassName="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-fill"
            panelClassName="max-h-80 w-48 overflow-y-auto p-1"
            label={
                <span onClick={onOpen} className="flex items-center">
                    <Ring color={color} />
                    <span className="sr-only">Change colour</span>
                </span>
            }
        >
            {(close) =>
                STAGE_COLOR_PALETTE.map((option) => (
                    <MenuItem
                        key={option.hex}
                        selected={option.hex.toLowerCase() === color.toLowerCase()}
                        onClick={() => {
                            onPick(option.hex);
                            close();
                        }}
                    >
                        <Ring color={option.hex} />
                        {option.name[0].toUpperCase() + option.name.slice(1)}
                    </MenuItem>
                ))
            }
        </Dropdown>
    );
}

// An upright oval outline filled with a soft wash of the colour, like twenty.com's
function Ring({ color }: { color: string }) {
    return <span className="h-4 w-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: color, backgroundColor: `${color}1f` }} />;
}
