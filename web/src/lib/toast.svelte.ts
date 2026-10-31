export interface Toast {
    id: number;
    text: string;
    kind: 'ok' | 'error';
}

let next = 1;
export const toasts = $state<Toast[]>([]);

export function toast(text: string, kind: Toast['kind'] = 'ok') {
    const t = { id: next++, text, kind };
    toasts.push(t);
    setTimeout(() => {
        const i = toasts.findIndex((x) => x.id === t.id);
        if (i >= 0) toasts.splice(i, 1);
    }, kind === 'error' ? 6000 : 3500);
}
