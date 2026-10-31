// Talks to fivecord's api over server events. See fivecord/src/api.ts.

export interface Staff {
    id: string;
    name: string;
    avatar?: string;
}

export class Refused extends Error {}

let next = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

on('fivecord:api:done', (id: number, ok: boolean, result: unknown) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (ok) p.resolve(result);
    else p.reject(new Refused(String(result)));
});

export const running = () => GetResourceState('fivecord') === 'started';

export function call<T = any>(action: string, args: unknown[], staff: Staff): Promise<T> {
    if (!running()) return Promise.reject(new Refused('This needs fivecord running on the server.'));
    const id = next++;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Refused('fivecord took too long to answer.'));
        }, 20_000);
        pending.set(id, { resolve, reject, timer });
        emit('fivecord:api', id, action, args, { id: staff.id, name: staff.name, avatar: staff.avatar });
    });
}

export function log(kind: string, title: string, description: string, color = 0x9c2cf1) {
    if (!running()) return;
    try {
        (globalThis as any).exports.fivecord.log(kind, title, description, color);
    } catch {}
}
