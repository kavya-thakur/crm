"use client";

import { IconPrinter } from "@tabler/icons-react";

// The browser's own print dialog, where "Save as PDF" is one of the printers
export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
        >
            <IconPrinter size={15} /> Print or save as PDF
        </button>
    );
}
