"use client";

import { IconCheck } from "@tabler/icons-react";
import { STAGE_COLOR_PALETTE } from "@/lib/stageColors";

// A fixed, curated palette instead of a native <input type="color"> — keeps
// every stage looking like it belongs to the same (premium) design system.
export function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {STAGE_COLOR_PALETTE.map((color) => {
                const selected = value.toLowerCase() === color.hex.toLowerCase();

                return (
                    <button
                        key={color.hex}
                        type="button"
                        title={color.name}
                        aria-label={color.name}
                        aria-pressed={selected}
                        onClick={() => onChange(color.hex)}
                        style={{ backgroundColor: color.hex }}
                        className={`flex size-7 items-center justify-center rounded-full outline-offset-2 transition
                            ${selected ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110"}`}
                    >
                        {selected && <IconCheck size={14} className="text-white" />}
                    </button>
                );
            })}
        </div>
    );
}
