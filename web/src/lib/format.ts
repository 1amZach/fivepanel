export function duration(seconds: number) {
    seconds = Math.max(0, Math.round(seconds));
    if (seconds < 60) return `${seconds}s`;
    const parts: string[] = [];
    for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60]] as const) {
        const n = Math.floor(seconds / size);
        if (n) parts.push(`${n}${unit}`);
        seconds -= n * size;
        if (parts.length === 2) break;
    }
    return parts.join(' ');
}

// accepts unix seconds or milliseconds
const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

export function ago(t?: number | null) {
    if (!t) return 'never';
    const s = (Date.now() - ms(t)) / 1000;
    if (s < 0) return `in ${duration(-s)}`;
    if (s < 45) return 'just now';
    return `${duration(s)} ago`;
}

export const date = (t?: number | null) =>
    t ? new Date(ms(t)).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const clock = (t: number) => new Date(ms(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const labels: Record<string, string> = {
    honeypot: 'Fake event', blockedExplosion: 'Blocked explosion', invisibleExplosion: 'Invisible explosion',
    explosionSpam: 'Explosion spam', blockedModel: 'Blocked model', entitySpam: 'Entity spam',
    giveWeapon: 'Gave weapons', removeWeapon: 'Took weapons', clearTasks: 'Cleared tasks',
    particleSpam: 'Particle spam', projectileSpam: 'Projectile spam', meleeRange: 'Melee range',
    blockedWeapon: 'Blocked weapon', health: 'Health', armour: 'Armour', invincible: 'Invincible',
    teleport: 'Teleport', speed: 'Speed', heartbeat: 'Heartbeat', injection: 'Injection',
    godmode: 'Godmode', damageModifier: 'Damage boost', spectate: 'Spectate', invisible: 'Invisible',
    noclip: 'Noclip', superJump: 'Super jump', freecam: 'Freecam', vision: 'Vision', blockedCommand: 'Menu command', exploit: 'Script exploit',
};

export const logKinds: Record<string, { label: string; color: string }> = {
    joins: { label: 'Joins', color: 'teal' },
    chat: { label: 'Chat', color: '' },
    deaths: { label: 'Deaths', color: 'red' },
    damage: { label: 'Damage', color: 'amber' },
    money: { label: 'Money', color: 'green' },
    items: { label: 'Items', color: 'brand' },
    vehicles: { label: 'Vehicles', color: 'teal' },
    resources: { label: 'Resources', color: '' },
};

// the profile link for someone in a log line
export const playerRef = (license?: string | null) => (license ? `#${license.replace(/^license:/, '')}` : '');
