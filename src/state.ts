// Things the panel keeps track of itself: console output, server timing,
// player count history, joins and leaves, anticheat detections and staff actions.

const started = Date.now();

function ring<T>(size: number) {
    const items: T[] = [];
    return {
        push(item: T) {
            items.push(item);
            if (items.length > size) items.shift();
        },
        all: () => items,
    };
}

type Listener = (channel: string, data: unknown) => void;
const listeners = new Set<Listener>();
export const subscribe = (fn: Listener) => (listeners.add(fn), () => listeners.delete(fn));
export const publish = (channel: string, data: unknown) => {
    for (const fn of listeners) fn(channel, data);
};

// ------------------------------------------------------------------ console

export interface Line {
    at: number;
    channel: string;
    text: string;
}

export const consoleLines = ring<Line>(1000);

RegisterConsoleListener((channel: string, message: string) => {
    const line = { at: Date.now(), channel, text: message.replace(/\^\d/g, '') };
    consoleLines.push(line);
    publish('console', line);
});

// ------------------------------------------------------------------ timing

// How long the server's ticks are taking. FXServer aims for one every 50ms or so.
const ticks: number[] = [];
let last = Date.now();
setTick(() => {
    const t = Date.now();
    ticks.push(t - last);
    last = t;
    if (ticks.length > 200) ticks.shift();
});

export function stats() {
    const sorted = [...ticks].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const memory = process.memoryUsage();
    return {
        uptime: Math.floor((Date.now() - started) / 1000),
        tick: { avg: Math.round(avg * 10) / 10, worst: sorted.at(-1) ?? 0 },
        memory: Math.round(memory.rss / 1048576),
        players: GetPlayers().length,
        maxPlayers: GetConvarInt('sv_maxclients', 48),
        hostname: GetConvar('sv_projectName', '') || GetConvar('sv_hostname', 'FiveM server').replace(/\^\d/g, ''),
    };
}

// one sample a minute for the last 6 hours
export const history = ring<{ at: number; players: number }>(360);
setInterval(() => history.push({ at: Date.now(), players: GetPlayers().length }), 60_000);

// ------------------------------------------------------------------ joins

export interface Visit {
    at: number;
    kind: 'join' | 'leave';
    src: number;
    name: string;
    reason?: string;
}

export const visits = ring<Visit>(100);

on('playerJoining', () => {
    const v: Visit = { at: Date.now(), kind: 'join', src: Number(source), name: GetPlayerName(source) };
    visits.push(v);
    publish('visit', v);
});

on('playerDropped', (reason: string) => {
    const v: Visit = { at: Date.now(), kind: 'leave', src: Number(source), name: GetPlayerName(source), reason };
    visits.push(v);
    publish('visit', v);
});

// ------------------------------------------------------------------ warden

export interface Detection {
    id: number;
    at: number;
    src: number;
    name: string;
    license?: string;
    kind: string;
    detail?: string;
    action: string;
    image?: string;
    dismissed?: boolean;
}

let nextDetection = 1;
export const detections = ring<Detection>(300);

on('warden:detected', (src: number, kind: string, detail: string | undefined, action: string) => {
    if (action !== 'log') return; // kicks and bans arrive below with their screenshot
    const d: Detection = { id: nextDetection++, at: Date.now(), src, name: GetPlayerName(src) ?? `#${src}`, kind, detail, action };
    detections.push(d);
    publish('detection', { ...d, image: undefined });
});

on('warden:punished', (src: number, action: string, kind: string, detail: string | undefined, name: string, license: string | undefined, image?: string) => {
    const d: Detection = { id: nextDetection++, at: Date.now(), src, name, license, kind, detail, action, image };
    detections.push(d);
    publish('detection', { ...d, image: undefined, hasImage: Boolean(image) });
});

// ------------------------------------------------------------------ activity

export interface Activity {
    at: number;
    staff: string;
    text: string;
}

export const activity = ring<Activity>(200);

export function did(staff: string, text: string) {
    const a = { at: Date.now(), staff, text };
    activity.push(a);
    publish('activity', a);
    console.log(`fivepanel: ${staff} ${text}`);
}
