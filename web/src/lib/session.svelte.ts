import { api, whenLoggedOut } from './api';

export interface Me {
    staff: { id: string; name: string; avatar?: string };
    access: { tier: number; tierName: string | null; tiers: string[]; needs: Record<string, number>; via: string };
    features: { fivecord: boolean; warden: boolean; screenshots: boolean };
    map: { image: string; bounds: [number, number, number, number] };
}

export const session = $state<{ me: Me | null; loading: boolean; error: string | null }>({ me: null, loading: true, error: null });

whenLoggedOut(() => (session.me = null));

export async function loadMe() {
    session.loading = true;
    try {
        session.me = await api<Me>('/api/me');
        session.error = null;
    } catch (err) {
        session.me = null;
        const e = err as { status?: number; message: string };
        session.error = e.status === 401 ? null : e.message;
    }
    session.loading = false;
}

export function can(key: string) {
    const a = session.me?.access;
    if (!a || a.tier < 0) return false;
    const need = a.needs[key] ?? a.needs[key.split(' ')[0]!] ?? a.tiers.length - 1;
    return a.tier >= need;
}

export const has = (feature: keyof Me['features']) => Boolean(session.me?.features[feature]);
