"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

// A quick fade + rise so a freshly mounted record panel, form, or list view
// doesn't just snap into place of whatever was showing before.
export function usePanelEnter<T extends HTMLElement>() {
    const ref = useRef<T>(null);

    useLayoutEffect(() => {
        if (!ref.current) return;
        gsap.fromTo(
            ref.current,
            { opacity: 0, y: 4 },
            { opacity: 1, y: 0, duration: 0.3, ease: "power3.out", clearProps: "transform" }
        );
    }, []);

    return ref;
}
