"use client";

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
    // a fresh key each time it opens, so a form never keeps last time's values
    const [opening, setOpening] = useState(0);

    // Adjusting state while rendering (React's own pattern for this) instead
    // of in an effect — opening must show `children` in the same commit that
    // showModal() runs, with no extra render in between.
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) {
            setRendered(true);
            setOpening(opening + 1);
        }
    }

    useLayoutEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;

        // the open/close motion itself is CSS (dialog.popup in globals.css)
        if (!open && dialog.open) dialog.close();
        if (open && !dialog.open) {
            // Show it a frame later: the form has just been rendered into the closed dialog,
            // so that work is done before the animation starts instead of eating its first frames
            const frame = requestAnimationFrame(() => dialog.showModal());
            return () => cancelAnimationFrame(frame);
        }
    }, [open]);

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            // unmount the contents once the exit transition has finished
            onTransitionEnd={(e) => e.target === ref.current && !ref.current.open && setRendered(false)}
            // a click on the dialog element itself (not its content) is a click on the backdrop
            onClick={(e) => e.target === ref.current && onClose()}
            className={`m-auto ${wide ? "w-140" : "w-100"} max-w-[calc(100%-32px)] rounded-lg bg-surface text-ink shadow-heavy popup`}
        >
            {/* only mounted while open (or animating closed), so forms start empty every time */}
            {rendered && <Fragment key={opening}>{children}</Fragment>}
        </dialog>
    );
}
