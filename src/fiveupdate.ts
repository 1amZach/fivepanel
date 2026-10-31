// Updates through fiveupdate, over server events. See fiveupdate/src/index.ts.

import { Refused } from './fivecord';

let next = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

on('fiveupdate:api:done', (id: number, ok: boolean, result: unknown) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (ok) p.resolve(result);
    else p.reject(new Refused(String(result)));
});

export const running = () => GetResourceState('fiveupdate') === 'started';

// Previews and updates download from GitHub, so they get a long time.
export function call(action: string, ...args: unknown[]): Promise<any> {
    if (!running()) return Promise.reject(new Refused('This needs fiveupdate running on the server.'));
    const id = next++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Refused('fiveupdate took too long to answer. GitHub may be slow, try again.'));
        }, 120_000);
        pending.set(id, { resolve, reject, timer });
        emit('fiveupdate:api', id, action, ...args);
    });
}
