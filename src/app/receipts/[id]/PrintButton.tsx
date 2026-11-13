"use client";

import { IconDownload } from "@tabler/icons-react";

// The browser's print window, where "Save as PDF" makes the file: no PDF library needed
export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
        >
            <IconDownload size={15} />
            Download PDF
        </button>
    );
}
