// A tinted pill — background is the stage's own color at low opacity, text
// is the solid color — instead of a plain dot + black text. Shared by every
// place a Lead stage or Deal pipeline stage shows up (table, board, panel,
// bulk menu), so they all read the same way.
export function StageBadge({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="inline-flex h-6 max-w-full items-center truncate rounded-md px-2 text-sm font-medium"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            {name}
        </span>
    );
}
