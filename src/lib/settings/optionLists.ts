// Pipeline stages, lead stages and lead sources are all edited the same way: the settings
// page sends back the whole list, in order, and the server makes the database match it.
// This works out what that means (which rows to delete, update and create) and catches
// the mistakes that would otherwise fail halfway through the save.

interface SentOption {
    /** missing = a new option */
    id?: number;
    name: string;
}

type Plan<T> =
    | { ok: false; message: string }
    | {
          ok: true;
          /** existing rows that aren't in the list any more */
          removeIds: number[];
          /** existing rows to save, with their new position */
          updates: (T & { id: number; order: number })[];
          /** new rows, with their position */
          creates: (T & { order: number })[];
      };

export function planOptionList<T extends SentOption>(existingIds: number[], sent: T[]): Plan<T> {
    const existing = new Set(existingIds);

    // an id this organization doesn't have: deleted in another tab, or not theirs
    if (sent.some((option) => option.id !== undefined && !existing.has(option.id))) {
        return { ok: false, message: "This list changed since you opened it. Reload the page and try again." };
    }

    const ids = sent.flatMap((option) => (option.id === undefined ? [] : [option.id]));
    if (new Set(ids).size !== ids.length) {
        return { ok: false, message: "The same option appears twice in the list" };
    }

    // names must be unique (the database enforces it); "Won" and "won " count as the same
    const names = new Set<string>();
    for (const option of sent) {
        const key = option.name.trim().toLowerCase();
        if (names.has(key)) {
            return { ok: false, message: `"${option.name.trim()}" is used twice. Each name must be different.` };
        }
        names.add(key);
    }

    const kept = new Set(ids);

    return {
        ok: true,
        removeIds: existingIds.filter((id) => !kept.has(id)),
        updates: sent.flatMap((option, order) => (option.id === undefined ? [] : [{ ...option, id: option.id, order }])),
        creates: sent.flatMap((option, order) => (option.id === undefined ? [{ ...option, order }] : [])),
    };
}

// While a save runs, every kept row first gets a placeholder name like this, so renames
// that swap two names ("New" <-> "Open") never trip the unique-name rule midway through
export function placeholderName(id: number) {
    return `__saving_${id}`;
}
