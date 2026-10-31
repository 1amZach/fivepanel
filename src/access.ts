// Who can do what. With fivecord running its tiers and Config.permissions are
// used, so the panel and the slash commands always agree. Without it the panel
// uses config.json's staff list and aces.

import { config } from './config';
import * as fivecord from './fivecord';
import type { Staff } from './fivecord';

// The same keys and defaults fivecord uses.
const defaults: Record<string, string | null> = {
    players: 'support', lookup: 'support', where: 'support', revive: 'support', heal: 'support',
    teleport: 'mod', kill: 'admin', message: 'support', warn: 'support',
    'warnings view': 'support', 'warnings remove': 'mod', 'warnings clear': 'admin',
    'note add': 'support', 'note remove': 'support',
    kick: 'mod', freeze: 'mod', screenshot: 'mod', ban: 'mod', unban: 'mod', bans: 'support',
    'server status': 'support', 'server lock': 'admin', 'server unlock': 'admin', 'server kickall': 'admin',
    'server restart': 'admin', 'server cancelrestart': 'admin', 'server weather': 'mod', 'server time': 'mod',
    announce: 'mod',
    'resource list': 'support', 'resource start': 'admin', 'resource stop': 'admin', 'resource restart': 'admin',
    'resource refresh': 'admin', console: 'owner',
    // panel only, fivecord doesn't have these
    logs: 'mod',
};

export interface Access {
    tier: number;
    tierName: string | null;
    tiers: string[];
    needs: Record<string, number>;
    via: 'fivecord' | 'panel';
}

const indexIn = (tiers: string[]) => (name: string | null | undefined) => {
    if (name == null || name === 'everyone') return -1;
    const i = tiers.indexOf(name);
    return i >= 0 ? i : tiers.length - 1;
};

function local(id: string): Access {
    const tiers = config.tiers;
    const index = indexIn(tiers);

    let tier = config.staff[id] ? index(config.staff[id]) : -1;
    for (let i = tiers.length - 1; i > tier; i--) {
        if (IsPrincipalAceAllowed(`identifier.discord:${id}`, `fivepanel.${tiers[i]}`)) {
            tier = i;
            break;
        }
    }

    const needs: Record<string, number> = {};
    for (const [key, name] of Object.entries(defaults)) {
        const [cmd] = key.split(' ');
        needs[key] = index(config.permissions[key] ?? config.permissions[cmd!] ?? name);
    }
    return { tier, tierName: tier >= 0 ? tiers[tier]! : null, tiers, needs, via: 'panel' };
}

const cache = new Map<string, { access: Access; at: number }>();

export async function of(staff: Staff): Promise<Access> {
    const hit = cache.get(staff.id);
    if (hit && Date.now() - hit.at < 60_000) return hit.access;

    let access: Access;
    if (fivecord.running()) {
        try {
            const a = await fivecord.call('access', [], staff);
            const needs = { ...a.needs };
            const index = indexIn(a.tiers);
            for (const key of ['logs']) needs[key] ??= index(config.permissions[key] ?? defaults[key]);
            access = { tier: a.tier, tierName: a.tierName, tiers: a.tiers, needs, via: 'fivecord' };
        } catch {
            access = local(staff.id);
        }
    } else {
        access = local(staff.id);
    }

    cache.set(staff.id, { access, at: Date.now() });
    return access;
}

export const forget = () => cache.clear();

export function can(a: Access, key: string) {
    const need = a.needs[key] ?? a.needs[key.split(' ')[0]!] ?? a.tiers.length - 1;
    return a.tier >= 0 && a.tier >= need;
}
