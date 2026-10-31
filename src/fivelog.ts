// Searches fivelog's database over server events. See fivelog/server/core.lua.

import { Refused } from './fivecord';

let next = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

on('fivelog:query:done', (id: number, ok: boolean, result: unknown) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (ok) p.resolve(Array.isArray(result) ? result : Object.values(result ?? {}));
    else p.reject(new Refused(String(result)));
});

export const running = () => GetResourceState('fivelog') === 'started';

export interface Filter {
    kind?: string | string[];
    player?: string;
    q?: string;
    before?: number;
    from?: number;
    to?: number;
    limit?: number;
}

export function query(filter: Filter): Promise<any[]> {
    if (!running()) return Promise.reject(new Refused('This needs fivelog running on the server.'));
    const id = next++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Refused('The log search took too long.'));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        emit('fivelog:query', id, filter);
    });
}
