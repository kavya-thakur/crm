"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { IconCheck } from "@tabler/icons-react";

interface DropdownProps {
    label: ReactNode;
    buttonClassName: string;
    align?: "left" | "right";
    openUp?: boolean;
    disabled?: boolean;
    onClose?: () => void;
    // overrides the default menu size/padding for a richer panel (e.g. FilterPanel)
    panelClassName?: string;
    // gets close() so an item can shut the menu after it runs
    children: (close: () => void) => ReactNode;
}

// Twenty-style menu: frosted white box, thin border, strong shadow
export function Dropdown({ label, buttonClassName, align = "left", openUp = false, disabled, onClose, panelClassName, children }: DropdownProps) {
    const [open, setOpen] = useState(false);
    // Stays true through the close animation — open itself flips first so the
    // tween direction is right, then this unmounts the panel once it's done.
    const [rendered, setRendered] = useState(false);
    // Measured against the real panel height once it's open, so it works no
    // matter how tall any particular dropdown's content is.
    const [flipUp, setFlipUp] = useState(openUp);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const openMenu = () => {
        // both before the layout effect below, so the panel already exists
        // in the DOM (and is measurable) the moment it runs
        setRendered(true);
        setOpen(true);
    };

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
            }

            gsap.fromTo(
                panel,
                { opacity: 0, y: flip ? 6 : -6, scale: 0.97 },
                { opacity: 1, y: 0, scale: 1, duration: 0.14, ease: "power2.out" }
            );
        } else if (rendered) {
            gsap.to(panel, {
                opacity: 0,
                y: flipUp ? 6 : -6,
                scale: 0.97,
                duration: 0.1,
                ease: "power2.in",
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

            {rendered && (
                <>
                    {/* invisible layer over the page: clicking anywhere outside closes the menu */}
                    <div className="fixed inset-0 z-40" onClick={close} />
                    <div
                        ref={panelRef}
                        className={`absolute z-50 overflow-y-auto rounded-lg border border-line bg-surface/95 font-normal shadow-strong backdrop-blur-md
                            ${align === "right" ? "right-0" : "left-0"}
                            ${flipUp ? "bottom-full mb-1" : "top-full mt-1"}
                            ${panelClassName ?? "max-h-80 min-w-50 p-1"}`}
                    >
                        {children(close)}
                    </div>
                </>
            )}
        </div>
    );
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
