// A pretend FiveM server. Import before anything from src.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = globalThis as any;
const handlers = new Map<string, ((...args: any[]) => unknown)[]>();

export const root = mkdtempSync(join(tmpdir(), 'fivepanel-'));
mkdirSync(join(root, 'web', 'dist', 'assets'), { recursive: true });
writeFileSync(join(root, 'web', 'dist', 'index.html'), '<!doctype html><title>fivepanel</title>');
writeFileSync(join(root, 'web', 'dist', 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(root, 'secret.txt'), 'do not serve');

export const files = new Map<string, string>([['config.json', JSON.stringify({ staff: { '111111111111111111': 'owner', '222222222222222222': 'support' } })]]);
export const commands: string[] = [];
export const dropped: { src: number; reason: string }[] = [];
export const net: { event: string; target: unknown; args: unknown[] }[] = [];
export const states: Record<string, string> = { fivepanel: 'started', fivecord: 'missing', warden: 'missing', 'screenshot-basic': 'missing' };
export const aces = new Set<string>();
export const players = new Map<number, { name: string; ids: string[]; pos: number[] }>();
export const consoleListeners: ((channel: string, message: string) => void)[] = [];

g.on = g.onNet = (event: string, fn: (...args: any[]) => unknown) => {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event)!.push(fn);
};
export function fire(event: string, src: unknown, ...args: unknown[]) {
    g.source = src;
    for (const fn of handlers.get(event) ?? []) fn(...args);
}
g.emit = (event: string, ...args: unknown[]) => queueMicrotask(() => fire(event, g.source, ...args));
g.emitNet = (event: string, target: unknown, ...args: unknown[]) => net.push({ event, target, args });
g.setTick = () => 0;

g.GetCurrentResourceName = () => 'fivepanel';
g.GetResourcePath = () => root;
g.GetConvar = (name: string, fallback: string) =>
    ({ fivepanel_discord_id: 'app-id', fivepanel_discord_secret: 'app-secret', fivepanel_url: 'http://panel.test', sv_hostname: '^1Test ^7RP' })[name] ?? fallback;
g.GetConvarInt = (_: string, fallback: number) => fallback;
g.LoadResourceFile = (_: string, path: string) => files.get(path) ?? null;
g.SaveResourceFile = (_: string, path: string, data: string) => (files.set(path, data), true);
g.ExecuteCommand = (c: string) => commands.push(c);
g.RegisterConsoleListener = (fn: (c: string, m: string) => void) => consoleListeners.push(fn);
g.IsPrincipalAceAllowed = (principal: string, ace: string) => aces.has(`${principal} ${ace}`);

g.GetPlayers = () => [...players.keys()].map(String);
g.GetPlayerName = (src: unknown) => players.get(Number(src))?.name ?? null;
g.GetPlayerPing = () => 42;
g.GetPlayerPed = (src: unknown) => (players.has(Number(src)) ? 1000 + Number(src) : 0);
g.GetEntityCoords = (ped: number) => players.get(ped - 1000)?.pos ?? [0, 0, 0];
g.GetEntityHealth = () => 200;
g.GetNumPlayerIdentifiers = (src: unknown) => players.get(Number(src))?.ids.length ?? 0;
g.GetPlayerIdentifier = (src: unknown, i: number) => players.get(Number(src))?.ids[i];
g.DropPlayer = (src: unknown, reason: string) => {
    dropped.push({ src: Number(src), reason });
    players.delete(Number(src));
};

const resources = ['fivepanel', 'ox_lib', 'old_hud', 'fivecord', 'warden'];
g.GetNumResources = () => resources.length;
g.GetResourceByFindIndex = (i: number) => resources[i];
g.GetResourceState = (name: string) => states[name] ?? (name === 'old_hud' ? 'stopped' : resources.includes(name) ? 'started' : 'missing');
g.GetResourceMetadata = (name: string, key: string) => (name === 'ox_lib' && key === 'version' ? '3.30.0' : '');
g.StartResource = (name: string) => ((states[name] = 'started'), true);
g.StopResource = (name: string) => ((states[name] = 'stopped'), true);

export const wardenBans = [{ id: 3, name: 'Cheater', reason: 'Anticheat: Noclip', created: 1700000000 }];
export const wardenUnbanned: unknown[] = [];
g.exports = new Proxy(() => {}, {
    get: (_t, res: string) => {
        if (res === 'warden') return { getBans: () => wardenBans, unban: (id: number, by: string) => (wardenUnbanned.push([id, by]), id === 3) };
        if (res === 'fivecord') return { log: () => {} };
        return undefined;
    },
});

export function addPlayer(src: number, name: string, pos = [100, 200, 30]) {
    players.set(src, { name, ids: [`license:${name.toLowerCase()}`, `discord:9${src}`, `ip:1.2.3.${src}`], pos });
}
