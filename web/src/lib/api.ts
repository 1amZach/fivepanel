import { toast } from './toast.svelte';

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

let onLoggedOut: () => void = () => {};
export const whenLoggedOut = (fn: () => void) => (onLoggedOut = fn);

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const res = await fetch(path, {
        method,
        headers: body === undefined ? { 'X-Fivepanel': '1' } : { 'Content-Type': 'application/json', 'X-Fivepanel': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
    }).catch(() => {
        throw new ApiError("Can't reach the server.", 0);
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) onLoggedOut();
    if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
    return data as T;
}

// For buttons: shows the result as a toast and never throws.
export async function act<T extends { text?: string } = { text?: string }>(path: string, body: unknown = {}, method = 'POST') {
    try {
        const r = await api<T>(path, method, body);
        if (r?.text) toast(r.text);
        return r;
    } catch (err) {
        toast((err as Error).message, 'error');
        return undefined;
    }
}

export const enc = (ref: string) => encodeURIComponent(ref);
