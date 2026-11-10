"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { IconCheck, IconSearch } from "@tabler/icons-react";

interface DropdownProps {
    label: ReactNode;
    buttonClassName: string;
    align?: "left" | "right";
    openUp?: boolean;
    disabled?: boolean;
    onClose?: () => void;
    // overrides the default menu size/padding for a richer panel (e.g. FilterPanel)
    panelClassName?: string;
    /** make the menu exactly as wide as its button, like a form select */
    matchWidth?: boolean;
    /** open as soon as it appears, e.g. an inline editor that's just been switched on */
    startOpen?: boolean;
    // gets close() so an item can shut the menu after it runs
    children: (close: () => void) => ReactNode;
}

// Twenty-style menu: frosted white box, thin border, strong shadow.
//
// On a normal page the menu is drawn on <body> (a portal) at a fixed spot next to its
// button, so no scrolling box or overflow-hidden parent around the button can cut it off:
// a select inside the filter panel, an editor on a board card at the bottom of a column.
// Inside a native <dialog> (Modal, SidePanel) it stays in place, since anything on <body>
// would sit behind the dialog.
export function Dropdown({ label, buttonClassName, align = "left", openUp = false, disabled, onClose, panelClassName, matchWidth, startOpen, children }: DropdownProps) {
    const [open, setOpen] = useState(false);
    // Stays true through the close animation — open itself flips first so the
    // tween direction is right, then this unmounts the panel once it's done.
    const [rendered, setRendered] = useState(false);
    // Measured against the real panel height once it's open, so it works no
    // matter how tall any particular dropdown's content is.
    const [flipUp, setFlipUp] = useState(openUp);
    // where the floating menu sits on screen; null while it's drawn in place (in a dialog)
    const [spot, setSpot] = useState<CSSProperties | null>(null);
    const [floating, setFloating] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const openMenu = () => {
        // both before the layout effect below, so the panel already exists
        // in the DOM (and is measurable) the moment it runs
        setFloating(!buttonRef.current?.closest("dialog"));
        setRendered(true);
        setOpen(true);
    };

    // startOpen: opens as soon as it appears, with the button focused so Esc closes it
    useEffect(() => {
        if (!startOpen) return;
        buttonRef.current?.focus();
        openMenu();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The floating menu's fixed position: under the button (or above it, when flipped),
    // lined up with its left or right edge, but always on screen. On a phone the button can be
    // near (or past) an edge, say in a toolbar scrolled sideways: the menu then stays 8px in from
    // the screen's edges, and is never wider than the screen.
    function place(flip: boolean) {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screen = window.innerWidth;
        const gap = 8;
        const right = Math.min(Math.max(gap, screen - rect.right), screen - gap);
        const left = Math.min(Math.max(gap, rect.left), screen - gap);
        // a left-aligned menu with little room to its right flips to the screen's right edge
        const fromLeft = align !== "right" && screen - left - gap >= Math.min(320, screen - 2 * gap);
        // on a phone a right-aligned menu opens from the screen's edge, so it gets the whole width
        // to grow into instead of only the room left of its button
        const fromRight = align === "right" && screen >= 640 ? right : gap;
        setSpot({
            ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            ...(fromLeft ? { left } : { right: fromRight }),
            ...(matchWidth && { width: rect.width }),
            maxWidth: fromLeft ? screen - left - gap : screen - fromRight - gap,
        });
    }

    // While open, the floating menu follows its button when anything scrolls or the window resizes
    useEffect(() => {
        if (!open || !floating) return;
        const follow = () => place(flipUp);
        window.addEventListener("scroll", follow, true);
        window.addEventListener("resize", follow);
        return () => {
            window.removeEventListener("scroll", follow, true);
            window.removeEventListener("resize", follow);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, floating, flipUp]);

    const close = () => {
        setOpen(false);
        onClose?.();
    };

    // Runs before paint: positions the panel (flipped up if it'd otherwise be
    // clipped) and plays its entrance, or — on the way out — its exit, only
    // unmounting once that tween finishes.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        if (open) {
            const button = buttonRef.current;
            let flip = flipUp;

            if (button) {
                const buttonRect = button.getBoundingClientRect();
                const spaceBelow = window.innerHeight - buttonRect.bottom;
                const spaceAbove = buttonRect.top;
                const panelHeight = panel.offsetHeight;

                flip = openUp
                    // asked to open up, but flip back down if there's truly more room there
                    ? spaceAbove >= panelHeight || spaceAbove >= spaceBelow
                    // asked to open down, but flip up if it would otherwise be clipped
                    : spaceBelow < panelHeight && spaceAbove > spaceBelow;

                setFlipUp(flip);
                if (floating) place(flip);
            }

            // Expands out of the button: it grows taller from the edge touching the button
            // while fading in. Only transform and opacity change, so the graphics card does
            // the work and it stays smooth. overwrite stops a half-finished collapse (a quick
            // re-open) from fighting it.
            gsap.fromTo(
                panel,
                { opacity: 0, scaleY: 0.85, scaleX: 0.97, y: flip ? 4 : -4 },
                {
                    opacity: 1,
                    scaleY: 1,
                    scaleX: 1,
                    y: 0,
                    duration: 0.3,
                    ease: "expo.out",
                    overwrite: true,
                    transformOrigin: `${align === "right" ? "right" : "left"} ${flip ? "bottom" : "top"}`,
                }
            );
        } else if (rendered) {
            // ...and collapses back into it
            gsap.to(panel, {
                opacity: 0,
                scaleY: 0.85,
                scaleX: 0.97,
                y: flipUp ? 4 : -4,
                duration: 0.18,
                ease: "power2.in",
                overwrite: true,
                onComplete: () => setRendered(false),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <div
            className="relative"
            onKeyDown={(e) => {
                // stop here so Esc doesn't also close a side panel behind the menu
                if (e.key === "Escape" && open) {
                    e.stopPropagation();
                    close();
                }
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                aria-expanded={open}
                onClick={() => (open ? close() : openMenu())}
                className={`${buttonClassName} ${open ? "bg-fill" : ""} disabled:opacity-60`}
            >
                {label}
            </button>

            {rendered && floatingOrInPlace(
                floating,
                <>
                    {/* invisible layer over the page: clicking anywhere outside closes the menu */}
                    <div className="fixed inset-0 z-40" onClick={close} />
                    <div
                        ref={panelRef}
                        style={floating ? spot ?? { top: -9999, left: -9999 } : undefined}
                        className={`z-50 overflow-y-auto rounded-lg border border-line bg-surface font-normal shadow-strong will-change-transform
                            ${floating ? "fixed" : `absolute ${align === "right" ? "right-0" : "left-0"} ${flipUp ? "bottom-full mb-1" : "top-full mt-1"}`}
                            ${matchWidth && !floating ? "w-full" : ""}
                            ${panelClassName ?? "max-h-80 min-w-50 p-1"}`}
                    >
                        {children(close)}
                    </div>
                </>,
            )}
        </div>
    );
}

// The menu goes on <body> when it floats, or stays where it is (in a dialog)
function floatingOrInPlace(floating: boolean, menu: ReactNode) {
    return floating ? createPortal(menu, document.body) : menu;
}

interface MenuItemProps {
    onClick: () => void;
    children: ReactNode;
    selected?: boolean;
    danger?: boolean;
}

export function MenuItem({ onClick, children, selected, danger }: MenuItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-8 w-full items-center gap-2 rounded px-1.5 text-left text-sm whitespace-nowrap
                ${danger ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-fill hover:text-ink"}`}
        >
            {children}
            {selected && <IconCheck size={14} className="ml-auto text-ink" />}
        </button>
    );
}

// The items of a menu that can get long (people, options): once there are more than
// 8, a search box sits on top and narrows the list as you type
export function SearchableItems<T>({ items, label, children }: { items: T[]; label: (item: T) => string; children: (item: T) => ReactNode }) {
    const [query, setQuery] = useState("");
    const term = query.trim().toLowerCase();
    const shown = term ? items.filter((item) => label(item).toLowerCase().includes(term)) : items;

    return (
        <>
            {items.length > 8 && (
                <div className="sticky top-0 z-1 mb-1 flex h-8 items-center gap-1.5 rounded-lg bg-app px-2">
                    <IconSearch size={14} className="shrink-0 text-faint" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search..."
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                    />
                </div>
            )}
            {shown.length === 0 && <p className="px-1.5 py-2 text-sm text-faint">No matches</p>}
            {shown.map(children)}
        </>
    );
}
