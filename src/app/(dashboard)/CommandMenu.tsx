"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import {
    IconArrowRight,
    IconBriefcase,
    IconBuilding,
    IconCalendar,
    IconCalendarDue,
    IconClock,
    IconCornerDownLeft,
    IconCurrencyRupee,
    IconFlag,
    IconLink,
    IconMail,
    IconPercentage,
    IconPhone,
    IconProgress,
    IconSearch,
    IconSearchOff,
    IconTag,
    IconUserCircle,
} from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { formatDate, formatDateTime, formatDay, formatMoney } from "@/lib/utils/format";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/Loader";
import { SectionIcon, type Section } from "@/components/SectionIcon";
import { StageBadge } from "@/components/StageBadge";
import { PriorityBadge } from "./shared/tasks";
import { ACTIVITY_TYPES, durationLabel, type ActivityStatus, type ActivityType } from "./activities/shared";
import { TASK_STATUSES, type TaskPriority, type TaskStatus } from "./tasks/shared";
import { rememberedUrl } from "./shared/useUrlState";

/**
 * The global search, opened with ⌘K (Ctrl+K), "/" or the sidebar's search button.
 * Type to search leads, deals, contacts, tasks and calls/meetings at once, or jump to a
 * page. Tab narrows it to one kind, arrow keys move, Enter opens, Esc closes. The
 * highlighted result is previewed on the right, like twenty.com's hover card, and what
 * you open is remembered under "Recent" for next time.
 */

export interface MenuPage {
    href: string;
    label: string;
    section: Section;
}

// The kinds of record search covers, with their filter label and icon
const KINDS = {
    lead: { label: "Leads", one: "Lead", section: "leads" },
    deal: { label: "Deals", one: "Deal", section: "deals" },
    contact: { label: "Contacts", one: "Contact", section: "contacts" },
    task: { label: "Tasks", one: "Task", section: "tasks" },
    activity: { label: "Calls & meetings", one: "Call or meeting", section: "activities" },
} as const satisfies Record<string, { label: string; one: string; section: Section }>;

export type SearchKind = keyof typeof KINDS;

type Owner = { assignedTo: { name: string } | null };

interface SearchResults {
    leads: (Owner & {
        id: number;
        name: string;
        companyName: string | null;
        email: string | null;
        phone: string | null;
        createdAt: string;
        stage: { name: string; color: string };
        source: { name: string; color: string } | null;
    })[];
    deals: (Owner & {
        id: number;
        title: string;
        amount: number;
        probability: number;
        expectedCloseDate: string | null;
        lead: { name: string } | null;
        pipelineStage: { name: string; color: string };
    })[];
    contacts: (Owner & { id: number; name: string; email: string | null; phone: string; jobTitle: string | null; company: { name: string } | null })[];
    tasks: (Owner & {
        id: number;
        title: string;
        status: TaskStatus;
        priority: TaskPriority;
        dueDate: string;
        lead: { name: string } | null;
        deal: { title: string } | null;
        contact: { name: string } | null;
    })[];
    activities: (Owner & { id: number; title: string; type: ActivityType; status: ActivityStatus; scheduledAt: string; durationMinutes: number | null })[];
}

// One line of the preview pane: "✉ Email  ana@acme.com"
interface PreviewField {
    icon: ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: ReactNode;
}

// One row of the menu. Its key starts with its kind ("lead-12", "page-/leads").
// Only the plain fields are kept in "Recent"; badges and the preview can't be stored.
interface Item {
    key: string;
    group: string;
    kind: Section;
    href: string;
    title: string;
    subtitle?: string;
    /** a person (lead, contact) shows their initial instead of the section icon */
    person?: boolean;
    trailing?: ReactNode;
    preview?: PreviewField[];
}

type RecentItem = Omit<Item, "trailing" | "preview">;

const OPEN_EVENT = "flash:open-search";
const RECENT_KEY = "flash:recent-search";

// "lead-12" -> "lead", "page-/leads" -> "page"
const kindOf = (item: RecentItem) => item.key.split("-")[0];

// What the sidebar's search button calls
export function openSearch() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

export function SearchButton() {
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

    return (
        <button
            type="button"
            onClick={openSearch}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-1 font-medium text-muted hover:bg-fill hover:text-ink"
        >
            <IconSearch size={15} />
            <span className="flex-1 text-left">Search</span>
            <kbd suppressHydrationWarning className="rounded border border-line bg-paper px-1 font-sans text-[11px] text-faint">
                {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
        </button>
    );
}

function readRecent(): RecentItem[] {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
        return [];
    }
}

function remember(item: Item) {
    const plain: RecentItem = { key: item.key, group: "Recent", kind: item.kind, href: item.href, title: item.title, subtitle: item.subtitle, person: item.person };
    try {
        const next = [plain, ...readRecent().filter((recent) => recent.key !== item.key)].slice(0, 6);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // private windows can refuse storage; search still works, it just won't remember
    }
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const owner = (record: Owner): PreviewField => ({ icon: IconUserCircle, label: "Owner", value: record.assignedTo?.name });

// The search results as menu rows, grouped in a fixed order
function toItems(results: SearchResults): Item[] {
    return [
        ...results.leads.map((lead) => ({
            key: `lead-${lead.id}`,
            group: KINDS.lead.label,
            kind: "leads" as const,
            href: `/leads?open=${lead.id}`,
            title: lead.name,
            subtitle: join(lead.companyName, lead.email),
            person: true,
            trailing: <StageBadge name={lead.stage.name} color={lead.stage.color} />,
            preview: [
                { icon: IconProgress, label: "Stage", value: <StageBadge name={lead.stage.name} color={lead.stage.color} /> },
                { icon: IconBuilding, label: "Company", value: lead.companyName },
                { icon: IconMail, label: "Email", value: lead.email },
                { icon: IconPhone, label: "Phone", value: lead.phone },
                { icon: IconTag, label: "Source", value: lead.source && <StageBadge name={lead.source.name} color={lead.source.color} /> },
                owner(lead),
                { icon: IconCalendar, label: "Created", value: formatDate(lead.createdAt) },
            ],
        })),
        ...results.deals.map((deal) => ({
            key: `deal-${deal.id}`,
            group: KINDS.deal.label,
            kind: "deals" as const,
            href: `/deals?open=${deal.id}`,
            title: deal.title,
            subtitle: join(formatMoney(deal.amount), deal.lead?.name),
            trailing: <StageBadge name={deal.pipelineStage.name} color={deal.pipelineStage.color} />,
            preview: [
                { icon: IconCurrencyRupee, label: "Amount", value: <span className="font-medium text-ink">{formatMoney(deal.amount)}</span> },
                { icon: IconProgress, label: "Stage", value: <StageBadge name={deal.pipelineStage.name} color={deal.pipelineStage.color} /> },
                { icon: IconPercentage, label: "Probability", value: `${deal.probability}%` },
                { icon: IconCalendarDue, label: "Closes", value: deal.expectedCloseDate && formatDay(deal.expectedCloseDate) },
                { icon: IconLink, label: "Lead", value: deal.lead?.name },
                owner(deal),
            ],
        })),
        ...results.contacts.map((contact) => ({
            key: `contact-${contact.id}`,
            group: KINDS.contact.label,
            kind: "contacts" as const,
            href: `/contacts?open=${contact.id}`,
            title: contact.name,
            subtitle: join(contact.jobTitle, contact.email ?? contact.phone),
            person: true,
            preview: [
                { icon: IconBriefcase, label: "Job title", value: contact.jobTitle },
                { icon: IconBuilding, label: "Company", value: contact.company?.name },
                { icon: IconMail, label: "Email", value: contact.email },
                { icon: IconPhone, label: "Phone", value: contact.phone },
                owner(contact),
            ],
        })),
        ...results.tasks.map((task) => {
            const status = TASK_STATUSES.find((item) => item.value === task.status)!;
            return {
                key: `task-${task.id}`,
                group: KINDS.task.label,
                kind: "tasks" as const,
                href: `/tasks?open=${task.id}`,
                title: task.title,
                subtitle: join(status.label, `Due ${formatDay(task.dueDate)}`),
                trailing: <PriorityBadge priority={task.priority} />,
                preview: [
                    { icon: IconProgress, label: "Status", value: <Dot color={status.color}>{status.label}</Dot> },
                    { icon: IconCalendarDue, label: "Due", value: formatDay(task.dueDate) },
                    { icon: IconFlag, label: "Priority", value: <PriorityBadge priority={task.priority} /> },
                    owner(task),
                    { icon: IconLink, label: "About", value: task.lead?.name ?? task.deal?.title ?? task.contact?.name },
                ],
            };
        }),
        ...results.activities.map((activity) => {
            const type = ACTIVITY_TYPES.find((item) => item.value === activity.type)!;
            return {
                key: `activity-${activity.id}`,
                group: KINDS.activity.label,
                kind: "activities" as const,
                href: `/activities?open=${activity.id}`,
                title: activity.title,
                subtitle: join(type.label, formatDateTime(activity.scheduledAt), activity.status === "SCHEDULED" ? null : activity.status.toLowerCase()),
                preview: [
                    { icon: type.icon, label: "Type", value: type.label },
                    { icon: IconCalendar, label: "When", value: formatDateTime(activity.scheduledAt) },
                    { icon: IconClock, label: "Length", value: activity.durationMinutes && durationLabel(activity.durationMinutes) },
                    { icon: IconProgress, label: "Status", value: activity.status[0] + activity.status.slice(1).toLowerCase() },
                    owner(activity),
                ],
            };
        }),
    ];
}

export default function CommandMenu({ pages, kinds }: { pages: MenuPage[]; kinds: SearchKind[] }) {
    const [open, setOpen] = useState(false);

    // ⌘K / Ctrl+K toggles it from anywhere; "/" opens it when you're not typing somewhere
    useEffect(() => {
        function onKey(event: globalThis.KeyboardEvent) {
            if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                setOpen((current) => !current);
                return;
            }
            const target = event.target as HTMLElement;
            const typing = target.closest("input, textarea, select, [contenteditable='true']");
            if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                setOpen(true);
            }
        }
        const onOpen = () => setOpen(true);

        window.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, []);

    // mounting fresh each time it opens means it always starts empty, with the latest "Recent"
    return open ? <Palette pages={pages} kinds={kinds} onClose={() => setOpen(false)} /> : null;
}

function Palette({ pages, kinds, onClose }: { pages: MenuPage[]; kinds: SearchKind[]; onClose: () => void }) {
    const router = useRouter();
    const panelRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [text, setText] = useState("");
    const [term, setTerm] = useState("");
    // undefined = every kind
    const [kind, setKind] = useState<SearchKind | undefined>();
    const [active, setActive] = useState(0);
    const [recent] = useState(readRecent);

    // wait for a short pause in typing before asking the server
    useEffect(() => {
        const timer = setTimeout(() => setTerm(text.trim()), 140);
        return () => clearTimeout(timer);
    }, [text]);

    const searchQuery = useQuery<SearchResults>({
        queryKey: ["search", term, kind],
        queryFn: ({ signal }) => api.get<{ data: SearchResults }>("/search", { params: { q: term, type: kind }, signal }).then((res) => res.data.data),
        enabled: term !== "",
        // keep the last results on screen while the next ones load, so the list doesn't flash
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });

    const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The dimmed backdrop fades in while the panel drops in from slightly above
    useLayoutEffect(() => {
        if (still()) return;
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
        // grows downward from its top edge while fading in (transform and opacity only,
        // so the graphics card animates it)
        gsap.fromTo(
            panelRef.current,
            { opacity: 0, scaleY: 0.9, scaleX: 0.98, y: -8 },
            { opacity: 1, scaleY: 1, scaleX: 1, y: 0, duration: 0.34, ease: "expo.out", transformOrigin: "50% 0%" }
        );
    }, []);

    // ...and both fade back out before it unmounts
    function dismiss() {
        if (still()) return onClose();
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: "power2.in", overwrite: true });
        // ...and shrinks back up into its top edge
        gsap.to(panelRef.current, {
            opacity: 0,
            scaleY: 0.9,
            scaleX: 0.98,
            y: -8,
            duration: 0.2,
            ease: "power2.in",
            overwrite: true,
            onComplete: onClose,
        });
    }

    const typed = text.trim().toLowerCase();
    // pages only show when no kind is picked; a kind narrows everything to that kind
    const matchingPages: Item[] = kind
        ? []
        : pages
              .filter((page) => page.label.toLowerCase().includes(typed))
              .map((page) => ({ key: `page-${page.href}`, group: "Go to", kind: page.section, href: page.href, title: page.label }));
    const recentOfKind = recent.filter((item) => !kind || kindOf(item) === kind);

    // empty: recent things, then every page; typing: the records found, then matching pages
    const items: Item[] = typed === "" ? [...recentOfKind, ...matchingPages] : [...(searchQuery.data && term ? toItems(searchQuery.data) : []), ...matchingPages];
    const activeIndex = Math.min(active, Math.max(items.length - 1, 0));
    const current = items[activeIndex];
    const loading = term !== "" && searchQuery.isFetching;
    const waiting = typed !== "" && (text.trim() !== term || (searchQuery.isPending && searchQuery.fetchStatus !== "idle"));

    // keep the highlighted row in view while moving with the arrow keys
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    function choose(item: Item) {
        // records are remembered; pages are always listed anyway
        if (kindOf(item) !== "page") remember(item);
        onClose();
        // a page opens the way you last left it (board or list, your filters)
        router.push(kindOf(item) === "page" ? rememberedUrl(item.href) : item.href);
    }

    function pickKind(next: SearchKind | undefined) {
        setKind(next);
        setActive(0);
    }

    function handleKey(event: KeyboardEvent) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (items.length === 0) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + items.length) % items.length);
        } else if (event.key === "Tab") {
            // Tab / Shift+Tab step through the kind filter: All, Leads, Deals, ...
            event.preventDefault();
            const order = [undefined, ...kinds];
            const at = order.indexOf(kind);
            pickKind(order[(at + (event.shiftKey ? -1 : 1) + order.length) % order.length]);
        } else if (event.key === "Enter" && current) {
            event.preventDefault();
            choose(current);
        } else if (event.key === "Escape") {
            event.preventDefault();
            dismiss();
        }
    }

    return (
        <div ref={overlayRef} className="fixed inset-0 z-60 flex justify-center bg-black/25 px-4 pt-[10vh]" onMouseDown={dismiss}>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                onMouseDown={(event) => event.stopPropagation()}
                className="flex h-fit w-full max-w-215 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-heavy"
            >
                <div className="flex h-14 shrink-0 items-center gap-3 px-4">
                    {loading ? <Spinner size={18} className="shrink-0 text-accent" /> : <IconSearch size={18} className="shrink-0 text-faint" />}
                    <input
                        autoFocus
                        value={text}
                        onChange={(event) => {
                            setText(event.target.value);
                            setActive(0);
                        }}
                        onKeyDown={handleKey}
                        placeholder={kind ? `Search ${KINDS[kind].label.toLowerCase()}…` : "Search leads, deals, contacts, tasks…"}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="search-results"
                        aria-activedescendant={current ? `search-${current.key}` : undefined}
                        aria-autocomplete="list"
                        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-light"
                    />
                    <kbd className="rounded border border-line bg-paper px-1.5 font-sans text-[11px] text-faint">esc</kbd>
                </div>

                {/* the kind filter: click a chip, or Tab through them from the search box */}
                <div role="radiogroup" aria-label="Search in" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-3 pb-2.5">
                    <FilterChip active={kind === undefined} onClick={() => pickKind(undefined)}>
                        All
                    </FilterChip>
                    {kinds.map((value) => (
                        <FilterChip key={value} active={kind === value} onClick={() => pickKind(value)}>
                            <SectionIcon section={KINDS[value].section} />
                            {KINDS[value].label}
                        </FilterChip>
                    ))}
                </div>

                <div className="flex h-[min(440px,58vh)] min-h-0">
                    <div ref={listRef} id="search-results" role="listbox" aria-label="Results" className="min-w-0 flex-1 overflow-y-auto p-2">
                        {searchQuery.isError && typed !== "" && (
                            <p className="px-3 py-6 text-center text-faint">Search isn&apos;t working right now. Try again in a moment.</p>
                        )}

                        {/* nothing found, once the server has actually answered for what's typed */}
                        {items.length === 0 && !waiting && !searchQuery.isError && (
                            <div className="flex flex-col items-center gap-2 px-3 py-14 text-center">
                                <span className="flex size-10 items-center justify-center rounded-xl bg-app text-faint">
                                    <IconSearchOff size={20} />
                                </span>
                                {typed ? (
                                    <>
                                        <p className="font-medium text-ink">No results for &ldquo;{text.trim()}&rdquo;</p>
                                        <p className="text-sm text-faint">Try a name, company, email, phone number or title.</p>
                                    </>
                                ) : (
                                    <p className="text-sm text-faint">Type to search {kind ? KINDS[kind].label.toLowerCase() : "everything"}.</p>
                                )}
                            </div>
                        )}

                        {items.map((item, index) => (
                            <div key={item.key}>
                                {/* a group's heading above its first row */}
                                {item.group !== items[index - 1]?.group && (
                                    <p className="flex h-8 items-center gap-1.5 px-2.5 pt-1 text-xs font-medium text-faint">
                                        {item.group === "Recent" && <IconClock size={12} />}
                                        {item.group}
                                    </p>
                                )}
                                <ResultRow
                                    item={item}
                                    index={index}
                                    active={index === activeIndex}
                                    highlight={typed}
                                    onHover={() => setActive(index)}
                                    onChoose={() => choose(item)}
                                />
                            </div>
                        ))}
                    </div>

                    {/* the highlighted result, previewed; hidden on narrow screens */}
                    <aside aria-live="polite" className="hidden w-72 shrink-0 overflow-y-auto border-l border-line-light bg-paper md:block">
                        {current && <Preview item={current} />}
                    </aside>
                </div>

                <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line-light bg-paper px-4 text-xs text-faint">
                    <span className="flex items-center gap-1">
                        <Key>↑</Key>
                        <Key>↓</Key> to move
                    </span>
                    <span className="flex items-center gap-1">
                        <Key>tab</Key> to filter
                    </span>
                    <span className="flex items-center gap-1">
                        <Key>
                            <IconCornerDownLeft size={11} />
                        </Key>
                        to open
                    </span>
                    <span className="ml-auto">{typed === "" ? "" : `${items.length} result${items.length === 1 ? "" : "s"}`}</span>
                </div>
            </div>
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            // the search box keeps focus, so typing carries on after picking a chip
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "border-ink bg-ink text-white [&_svg]:text-white!" : "border-line text-muted hover:border-line-strong hover:text-ink"
            }`}
        >
            {children}
        </button>
    );
}

function ResultRow({
    item,
    index,
    active,
    highlight,
    onHover,
    onChoose,
}: {
    item: Item;
    index: number;
    active: boolean;
    highlight: string;
    onHover: () => void;
    onChoose: () => void;
}) {
    return (
        <div
            id={`search-${item.key}`}
            data-index={index}
            role="option"
            aria-selected={active}
            onMouseMove={onHover}
            onClick={onChoose}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 ${active ? "bg-fill" : ""}`}
        >
            <ItemIcon item={item} />
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                    <Highlight text={item.title} term={highlight} />
                </span>
                {item.subtitle && (
                    <span className="block truncate text-sm text-faint">
                        <Highlight text={item.subtitle} term={highlight} />
                    </span>
                )}
            </span>
            {item.trailing && <span className="shrink-0">{item.trailing}</span>}
            {active && <IconArrowRight size={14} className="shrink-0 text-faint" />}
        </div>
    );
}

function ItemIcon({ item, large = false }: { item: RecentItem; large?: boolean }) {
    if (item.person) return <Avatar name={item.title} size={large ? "lg" : "md"} />;

    return (
        <span className={`flex shrink-0 items-center justify-center rounded-lg border border-line-light bg-surface ${large ? "size-10" : "size-7"}`}>
            <SectionIcon section={item.kind} size={large ? "md" : "sm"} />
        </span>
    );
}

// The pane beside the results: the highlighted record's main fields, without opening it
function Preview({ item }: { item: Item }) {
    const kind = kindOf(item);
    const label = kind === "page" ? "Page" : item.group === "Recent" ? `Recently opened ${KINDS[kind as SearchKind]?.one.toLowerCase() ?? ""}` : KINDS[kind as SearchKind]?.one;

    return (
        <div key={item.key} className="animate-[fade-in_0.12s_ease-out] p-4">
            <ItemIcon item={item} large />
            <p className="mt-3 text-[15px] leading-5 font-semibold break-words text-ink">{item.title}</p>
            <p className="mt-0.5 text-sm text-faint">{label}</p>

            {item.preview ? (
                <dl className="mt-4 flex flex-col gap-0.5">
                    {item.preview.map((field) => (
                        <div key={field.label} className="flex min-h-7 items-center gap-2 text-sm">
                            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-faint">
                                <field.icon size={14} className="shrink-0" />
                                {field.label}
                            </dt>
                            <dd className="min-w-0 flex-1 truncate text-muted">{field.value || <span className="text-light">Empty</span>}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                item.subtitle && <p className="mt-3 text-sm text-muted">{item.subtitle}</p>
            )}

            <p className="mt-5 flex items-center gap-1.5 text-xs text-faint">
                <Key>
                    <IconCornerDownLeft size={11} />
                </Key>
                {kind === "page" ? `to go to ${item.title}` : "to open"}
            </p>
        </div>
    );
}

// Marks where what you typed appears in a result, so you can see why it matched
function Highlight({ text, term }: { text: string; term: string }) {
    const at = term ? text.toLowerCase().indexOf(term) : -1;
    if (at < 0) return <>{text}</>;

    return (
        <>
            {text.slice(0, at)}
            <mark className="rounded-sm bg-[#fff1c2] text-inherit">{text.slice(at, at + term.length)}</mark>
            {text.slice(at + term.length)}
        </>
    );
}

function Dot({ color, children }: { color: string; children: ReactNode }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {children}
        </span>
    );
}

function Key({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[10px] text-muted">
            {children}
        </kbd>
    );
}
