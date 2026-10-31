export interface LivePlayer {
    src: number;
    name: string;
    ping: number;
    pos?: [number, number, number];
    health: number;
}

export interface Stats {
    uptime: number;
    tick: { avg: number; worst: number };
    memory: number;
    players: number;
    maxPlayers: number;
    hostname: string;
}

export interface Line {
    at: number;
    channel: string;
    text: string;
}

type Handler = (data: any) => void;

export const live = $state<{ connected: boolean; players: LivePlayer[]; stats: Stats | null }>({ connected: false, players: [], stats: null });

const handlers = new Map<string, Set<Handler>>();

// Run `fn` for every message on a channel until the returned function is called.
export function listen(channel: string, fn: Handler) {
    if (!handlers.has(channel)) handlers.set(channel, new Set());
    handlers.get(channel)!.add(fn);
    return () => handlers.get(channel)!.delete(fn);
}

let socket: WebSocket | undefined;
let wanted = false;
let retry = 1000;

function connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    socket = new WebSocket(url);
    socket.onopen = () => {
        live.connected = true;
        retry = 1000;
    };
    socket.onmessage = (e) => {
        const { channel, data } = JSON.parse(e.data);
        if (channel === 'players') live.players = data;
        else if (channel === 'stats') live.stats = data;
        for (const fn of handlers.get(channel) ?? []) fn(data);
    };
    socket.onclose = () => {
        live.connected = false;
        if (!wanted) return;
        setTimeout(() => wanted && connect(), retry);
        retry = Math.min(retry * 2, 15000);
    };
}

export function start() {
    if (wanted) return;
    wanted = true;
    connect();
}

export function stop() {
    wanted = false;
    socket?.close();
}
