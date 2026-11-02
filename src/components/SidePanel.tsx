"use client";

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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

        // the open/close motion itself is CSS (dialog.sheet in globals.css)
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
            // left-auto/h-auto/m-0 override the UA dialog defaults (left:0, height:fit-content,
            // margin:auto) that would otherwise fight the top/right/bottom-driven docked size
            className={`fixed top-2 right-2 bottom-2 left-auto m-0 h-auto overflow-y-auto ${wide ? "w-140" : "w-125"
                } max-w-[calc(100%-16px)] rounded-lg border border-line bg-surface text-ink shadow-strong sheet`}
        >
            {/* only mounted while open (or animating closed), so forms start empty every time */}
            {rendered && <Fragment key={opening}>{children}</Fragment>}
        </dialog>
    );
}
