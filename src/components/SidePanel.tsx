"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}

// Like Modal, but docks to the right edge and fills the height, matching the
// Lead/Deal/Contact record panels — used for the settings create/edit forms.
export function SidePanel({ open, onClose, children, wide = false }: SidePanelProps) {
    const ref = useRef<HTMLDialogElement>(null);
    // Stays true through the close animation, so the dialog doesn't actually
    // close (and the form doesn't unmount) until the slide-out finishes.
    const [rendered, setRendered] = useState(open);
    const [prevOpen, setPrevOpen] = useState(open);

    // Adjusting state while rendering (React's own pattern for this) instead
    // of in an effect — opening must show `children` in the same commit that
    // showModal() runs, with no extra render in between.
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) setRendered(true);
    }

    useLayoutEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;

        if (open) {
            if (!dialog.open) dialog.showModal();
            gsap.fromTo(
                dialog,
                { opacity: 0, x: 24 },
                { opacity: 1, x: 0, duration: 0.22, ease: "power3.out" }
            );
        } else if (dialog.open) {
            gsap.to(dialog, {
                opacity: 0,
                x: 24,
                duration: 0.16,
                ease: "power2.in",
                onComplete: () => {
                    dialog.close();
                    setRendered(false);
                },
            });
        }
    }, [open]);

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            // a click on the dialog element itself (not its content) is a click on the backdrop
            onClick={(e) => e.target === ref.current && onClose()}
            // left-auto/h-auto/m-0 override the UA dialog defaults (left:0, height:fit-content,
            // margin:auto) that would otherwise fight the top/right/bottom-driven docked size
            className={`fixed top-2 right-2 bottom-2 left-auto m-0 h-auto overflow-y-auto ${wide ? "w-140" : "w-125"
                } max-w-[calc(100%-16px)] rounded-lg border border-line bg-surface text-ink shadow-strong backdrop:bg-black/50`}
        >
            {/* only mounted while open (or animating closed), so forms start empty every time */}
            {rendered && children}
        </dialog>
    );
}
