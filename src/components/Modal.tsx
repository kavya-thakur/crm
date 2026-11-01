"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";

interface ModalProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}

// The native <dialog> gives us the backdrop, Esc to close and focus trapping for free
export function Modal({ open, onClose, children, wide = false }: ModalProps) {
    const ref = useRef<HTMLDialogElement>(null);
    // Stays true through the close animation, so the dialog doesn't actually
    // close (and the form doesn't unmount) until the fade-out finishes.
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
                { opacity: 0, y: 8, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "power2.out" }
            );
        } else if (dialog.open) {
            gsap.to(dialog, {
                opacity: 0,
                y: 8,
                scale: 0.96,
                duration: 0.14,
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
            className={`m-auto ${wide ? "w-140" : "w-100"} max-w-[calc(100%-32px)] rounded-lg bg-surface text-ink shadow-heavy backdrop:bg-black/50`}
        >
            {/* only mounted while open (or animating closed), so forms start empty every time */}
            {rendered && children}
        </dialog>
    );
}
