// Live updates over a WebSocket: player positions, server stats, console
// output, new detections and log lines, each only to staff allowed to see them.

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { can, of, type Access } from './access';
import { staffOf } from './auth';
import type { Staff } from './fivecord';
import * as state from './state';

interface Client {
    ws: WebSocket;
    staff: Staff;
    access: Access;
}

const clients = new Set<Client>();

const channelKey: Record<string, string> = {
    players: 'players',
    stats: 'players',
    visit: 'players',
    activity: 'players',
    console: 'console',
    detection: 'bans',
    log: 'logs',
};

function send(c: Client, channel: string, data: unknown) {
    if (c.ws.readyState !== c.ws.OPEN || !can(c.access, channelKey[channel] ?? 'console')) return;
    c.ws.send(JSON.stringify({ channel, data }));
}

const broadcast = (channel: string, data: unknown) => {
    for (const c of clients) send(c, channel, data);
};

state.subscribe(broadcast);

function positions() {
    return GetPlayers().map((id) => {
        const ped = GetPlayerPed(id);
        const pos = ped ? GetEntityCoords(ped) : undefined;
        return {
            src: Number(id),
            name: GetPlayerName(id),
            ping: GetPlayerPing(id),
            pos: pos && [Math.round(pos[0]!), Math.round(pos[1]!), Math.round(pos[2]!)],
            health: ped ? GetEntityHealth(ped) : 0,
        };
    });
}

export function startLive(server: Server) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

    server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? '/', 'http://panel');
        const staff = url.pathname === '/ws' ? staffOf(req) : undefined;
        const access = staff && (await of(staff).catch(() => undefined));
        if (!staff || !access || access.tier < 0) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            return socket.destroy();
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            const c: Client = { ws, staff, access };
            clients.add(c);
            ws.on('close', () => clients.delete(c));
            ws.on('error', () => clients.delete(c));
            send(c, 'players', positions());
            send(c, 'stats', state.stats());
        });
    });

    setInterval(() => {
        if (clients.size) broadcast('players', positions());
    }, 2000);

    setInterval(() => {
        if (clients.size) broadcast('stats', state.stats());
    }, 5000);

    // pick up role changes without a reconnect
    setInterval(async () => {
        for (const c of clients) c.access = await of(c.staff).catch(() => c.access);
    }, 60_000);

    return wss;
}

export const liveCount = () => clients.size;
