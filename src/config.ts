import { randomBytes } from 'node:crypto';

export const resource = GetCurrentResourceName();
export const cfx = (): any => (globalThis as any).exports;

export interface Config {
    port: number;
    host: string;
    url: string;
    discord: { id: string; secret: string };
    secret: string;
    // used when fivecord isn't running: discord id -> tier name
    staff: Record<string, string>;
    tiers: string[];
    permissions: Record<string, string>;
    map: { image: string; bounds: [number, number, number, number] };
    weatherTypes: string[];
    weatherCommand: string;
    timeCommand: string;
}

const defaults = {
    staff: {},
    tiers: ['support', 'mod', 'admin', 'owner'],
    permissions: {},
    // world coords at the image's left, bottom, right and top edges
    map: { image: '', bounds: [-4140, -4300, 4860, 8300] as [number, number, number, number] },
    weatherTypes: ['CLEAR', 'EXTRASUNNY', 'CLOUDS', 'OVERCAST', 'RAIN', 'THUNDER', 'FOGGY', 'SMOG', 'SNOW', 'XMAS', 'HALLOWEEN'],
    weatherCommand: 'weather {type}',
    timeCommand: 'time {hour} {minute}',
};

function readJson(): Partial<Config> {
    const raw = LoadResourceFile(resource, 'config.json');
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error(`fivepanel: config.json is not valid JSON (${(err as Error).message}), using defaults`);
        return {};
    }
}

// The cookie signing key. Made once and kept next to the resource so logins
// survive a restart.
function secret(): string {
    const set = GetConvar('fivepanel_secret', '');
    if (set) return set;
    const saved = LoadResourceFile(resource, 'secret.key');
    if (saved && saved.length >= 32) return saved.trim();
    const made = randomBytes(32).toString('hex');
    SaveResourceFile(resource, 'secret.key', made, made.length);
    return made;
}

export function load(): Config {
    const file = readJson();
    const port = GetConvarInt('fivepanel_port', 40120);
    return {
        ...defaults,
        ...file,
        map: { ...defaults.map, ...file.map },
        port,
        host: GetConvar('fivepanel_host', '0.0.0.0'),
        url: GetConvar('fivepanel_url', `http://localhost:${port}`).replace(/\/+$/, ''),
        discord: { id: GetConvar('fivepanel_discord_id', ''), secret: GetConvar('fivepanel_discord_secret', '') },
        secret: secret(),
    };
}

export let config: Config;
export const setConfig = (c: Config) => (config = c);
