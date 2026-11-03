"use client";

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";

/**
 * The round tick that finishes a task or activity (and un-finishes it). Not done: an empty
 * ring that turns green with a faint tick on hover. Done: a filled green circle with a white
 * tick, which pops in when it's ticked here (not when a list loads already done).
 * `className` sizes the clickable area around the circle.
 */
export function DoneCheck({
    done,
    label,
    onClick,
    size = 16,
    disabled,
    className = "",
}: {
    done: boolean;
    label: string;
    onClick: () => void;
    size?: number;
    disabled?: boolean;
    className?: string;
}) {
    const [doneAtFirst] = useState(done);

    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={done}
            onClick={onClick}
            disabled={disabled}
            className={`group/check flex shrink-0 items-center justify-center rounded-full disabled:opacity-60 ${className}`}
        >
            <span
                style={{ width: size, height: size }}
                className={`flex items-center justify-center rounded-full transition-colors duration-150 ${
                    done
                        ? `bg-success text-white ${doneAtFirst ? "" : "check-pop"}`
                        : "border-[1.5px] border-line-strong text-transparent group-hover/check:border-success group-hover/check:text-success"
                }`}
            >
                <IconCheck size={Math.round(size * 0.65)} stroke={3} />
            </span>
        </button>
    );
}
