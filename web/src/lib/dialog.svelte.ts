// A small form in a modal. `await ask(...)` gives the values, or null if cancelled.

export interface Field {
    name: string;
    label: string;
    type?: 'text' | 'textarea' | 'number' | 'select';
    options?: { value: string; label: string }[];
    value?: string;
    placeholder?: string;
    required?: boolean;
}

interface Dialog {
    open: boolean;
    title: string;
    text?: string;
    fields: Field[];
    confirm: string;
    danger: boolean;
    values: Record<string, string>;
    resolve?: (v: Record<string, string> | null) => void;
}

export const dialog = $state<Dialog>({ open: false, title: '', fields: [], confirm: 'OK', danger: false, values: {} });

export function ask(
    title: string,
    fields: Field[] = [],
    opts: { confirm?: string; danger?: boolean; text?: string } = {},
): Promise<Record<string, string> | null> {
    dialog.resolve?.(null);
    return new Promise((resolve) => {
        dialog.open = true;
        dialog.title = title;
        dialog.text = opts.text;
        dialog.fields = fields;
        dialog.confirm = opts.confirm ?? 'OK';
        dialog.danger = opts.danger ?? false;
        dialog.values = Object.fromEntries(fields.map((f) => [f.name, f.value ?? f.options?.[0]?.value ?? '']));
        dialog.resolve = resolve;
    });
}

export function close(ok: boolean) {
    const r = dialog.resolve;
    dialog.open = false;
    dialog.resolve = undefined;
    r?.(ok ? { ...dialog.values } : null);
}
