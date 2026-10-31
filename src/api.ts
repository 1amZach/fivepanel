import type { IncomingMessage } from 'node:http';
import { can, of, type Access } from './access';
import { cfx, config, resource } from './config';
import * as fivecord from './fivecord';
import * as fivelog from './fivelog';
import { Refused, type Staff } from './fivecord';
import * as state from './state';

export class Denied extends Error {}

export interface Ctx {
    staff: Staff;
    access: Access;
    params: string[];
    query: URLSearchParams;
    body: any;
}

type Route = { method: string; path: RegExp; key?: string; run: (c: Ctx) => unknown };
const routes: Route[] = [];
const route = (method: string, path: string, key: string | undefined, run: Route['run']) =>
    routes.push({ method, path: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), key, run });

const need = (c: Ctx, key: string) => {
    if (!can(c.access, key)) throw new Denied(`You need to be ${c.access.tiers[c.access.needs[key] ?? c.access.tiers.length - 1]} or higher to do that.`);
};

const wardenRunning = () => GetResourceState('warden') === 'started';
const screenshots = () => GetResourceState('screenshot-basic') === 'started';
const label = (s: Staff) => s.name;

function localPlayers() {
    return GetPlayers().map((id) => {
        const src = Number(id);
        const ped = GetPlayerPed(src);
        const ids: string[] = [];
        for (let i = 0; i < GetNumPlayerIdentifiers(src); i++) ids.push(GetPlayerIdentifier(src, i));
        return {
            src,
            name: GetPlayerName(src),
            ping: GetPlayerPing(src),
            pos: ped ? GetEntityCoords(ped).map((n) => Math.round(n * 10) / 10) : undefined,
            license: ids.find((i) => i.startsWith('license:')),
            discord: ids.find((i) => i.startsWith('discord:'))?.slice(8),
        };
    });
}

function screenshot(src: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Refused('No screenshot came back in time.')), 20_000);
        cfx()['screenshot-basic'].requestClientScreenshot(src, { encoding: 'jpg', quality: 0.85 }, (err: unknown, data: string) => {
            clearTimeout(timer);
            if (err || typeof data !== 'string') reject(new Refused(`Screenshot failed: ${String(err ?? 'no data')}`));
            else resolve(data);
        });
    });
}

// ------------------------------------------------------------------ general

route('GET', '/api/me', undefined, (c) => ({
    staff: c.staff,
    access: c.access,
    features: { fivecord: fivecord.running(), warden: wardenRunning(), screenshots: screenshots(), fivelog: fivelog.running() },
    map: config.map,
}));

route('GET', '/api/overview', undefined, async (c) => {
    let status;
    if (fivecord.running() && can(c.access, 'server status')) status = await fivecord.call('status', [], c.staff).catch(() => undefined);
    return {
        stats: state.stats(),
        history: state.history.all(),
        visits: state.visits.all().slice(-25).reverse(),
        detections: can(c.access, 'bans') ? state.detections.all().slice(-10).reverse().map((d) => ({ ...d, image: undefined, hasImage: Boolean(d.image) })) : [],
        activity: state.activity.all().slice(-15).reverse(),
        status,
    };
});

route('GET', '/api/activity', 'players', () => state.activity.all().slice().reverse());

// ------------------------------------------------------------------ players

route('GET', '/api/players', 'players', (c) => (fivecord.running() ? fivecord.call('players', [], c.staff) : localPlayers()));

route('GET', '/api/search', 'lookup', (c) => fivecord.call('search', [c.query.get('q') ?? ''], c.staff));

route('GET', '/api/player/:ref', 'lookup', (c) => {
    const ref = decodeURIComponent(c.params[0]!);
    if (fivecord.running()) return fivecord.call('profile', [ref], c.staff);
    const p = localPlayers().find((x) => `@${x.src}` === ref);
    if (!p) throw new Refused('Without fivecord only online players can be looked up.');
    return { ...p, online: p, warnings: [], notes: [], bans: [], identifiers: [] };
});

const standalone: Record<string, string> = { kick: 'kick', message: 'message', screenshot: 'screenshot' };

route('POST', '/api/player/:ref/:action', undefined, async (c) => {
    const ref = decodeURIComponent(c.params[0]!);
    const action = c.params[1]!;
    const args: unknown[] = Array.isArray(c.body?.args) ? c.body.args : [];

    if (fivecord.running()) {
        const r = await fivecord.call('act', [action, ref, ...args], c.staff);
        state.did(label(c.staff), `${action} ${ref}: ${r.text}`);
        return r;
    }

    const key = standalone[action];
    if (!key) throw new Refused('This needs fivecord running on the server.');
    need(c, key);
    const src = Number(ref.replace(/^@/, ''));
    const name = GetPlayerName(src);
    if (!name) throw new Refused('That player is not online.');

    if (action === 'kick') {
        DropPlayer(src, `Kicked by staff: ${String(args[0] ?? '')}`);
        state.did(label(c.staff), `kicked ${name}: ${args[0]}`);
        return { text: `Kicked ${name}.` };
    }
    if (action === 'message') {
        emitNet('chat:addMessage', src, { color: [156, 44, 241], args: [`Staff (${label(c.staff)})`, String(args[0] ?? '')] });
        state.did(label(c.staff), `messaged ${name}`);
        return { text: `Sent to ${name}.` };
    }
    if (!screenshots()) throw new Refused('Screenshots need the screenshot-basic resource.');
    const image = await screenshot(src);
    state.did(label(c.staff), `took a screenshot of ${name}`);
    return { text: `Screenshot of ${name}.`, image };
});

route('DELETE', '/api/entry/:kind/:id', undefined, async (c) => {
    const kind = c.params[0] === 'note' ? 'note' : 'warning';
    const r = await fivecord.call('removeEntry', [kind, Number(c.params[1])], c.staff);
    state.did(label(c.staff), r.text);
    return r;
});

// ------------------------------------------------------------------ bans

route('GET', '/api/bans', 'bans', async (c) => {
    const active = c.query.get('active') !== '0';
    const q = c.query.get('q') ?? '';
    if (fivecord.running()) return { source: 'fivecord', bans: await fivecord.call('bans', [active, q], c.staff) };
    if (!wardenRunning()) return { source: 'none', bans: [] };

    const lower = q.toLowerCase();
    const list = (cfx().warden.getBans() ?? []) as any[];
    return {
        source: 'warden',
        bans: Object.values(list)
            .filter((b: any) => !lower || String(b.name).toLowerCase().includes(lower) || String(b.reason).toLowerCase().includes(lower))
            .map((b: any) => ({ ...b, staff: 'warden', active: !b.expires || b.expires > Date.now() / 1000 })),
    };
});

route('POST', '/api/bans/:id/unban', 'unban', async (c) => {
    const id = Number(c.params[0]);
    if (c.body?.source === 'warden') {
        if (!wardenRunning() || !cfx().warden.unban(id, label(c.staff))) throw new Refused('That ban does not exist.');
        state.did(label(c.staff), `lifted warden ban #${id}`);
        return { text: `Lifted ban #${id}.` };
    }
    const r = await fivecord.call('unban', [id, String(c.body?.reason ?? '')], c.staff);
    state.did(label(c.staff), r.text);
    return r;
});

// ------------------------------------------------------------------ reports

route('GET', '/api/reports', 'players', (c) => fivecord.call('reports', [], c.staff));

route('POST', '/api/reports/:id/:action', 'players', async (c) => {
    const r = await fivecord.call('report', [c.params[1], Number(c.params[0]), c.body?.text], c.staff);
    state.did(label(c.staff), `${c.params[1]} report #${c.params[0]}`);
    return r;
});

// ------------------------------------------------------------------ anticheat

route('GET', '/api/detections', 'bans', () =>
    state.detections.all().slice().reverse().map((d) => ({ ...d, image: undefined, hasImage: Boolean(d.image) })),
);

route('GET', '/api/detections/:id/image', 'bans', (c) => {
    const d = state.detections.all().find((x) => x.id === Number(c.params[0]));
    if (!d?.image) throw new Refused('No screenshot for that one.');
    return { image: d.image };
});

route('POST', '/api/detections/:id/dismiss', 'bans', (c) => {
    const d = state.detections.all().find((x) => x.id === Number(c.params[0]));
    if (!d) throw new Refused('That detection is gone.');
    d.dismissed = true;
    state.did(label(c.staff), `dismissed a ${d.kind} detection on ${d.name}`);
    return { text: 'Dismissed.' };
});

// ------------------------------------------------------------------ logs

route('GET', '/api/logs', 'logs', (c) => {
    const n = (k: string) => (c.query.get(k) ? Number(c.query.get(k)) : undefined);
    const kinds = (c.query.get('kind') ?? '').split(',').filter(Boolean);
    return fivelog.query({
        kind: kinds.length ? kinds : undefined,
        player: c.query.get('player') || undefined,
        q: c.query.get('q')?.slice(0, 100) || undefined,
        before: n('before'),
        from: n('from'),
        to: n('to'),
        limit: Math.min(n('limit') ?? 100, 200),
    });
});

// ------------------------------------------------------------------ console

route('GET', '/api/console', 'console', () => state.consoleLines.all());

route('POST', '/api/console', 'console', (c) => {
    const command = String(c.body?.command ?? '').trim();
    if (!command) throw new Refused('Type a command.');
    state.did(label(c.staff), `ran \`${command}\``);
    fivecord.log('staff', 'Console command from the panel', `**${label(c.staff)}** ran \`${command.slice(0, 500)}\``);
    ExecuteCommand(command);
    return { text: 'Sent.' };
});

// ------------------------------------------------------------------ resources

route('GET', '/api/resources', 'resource list', () => {
    const out = [];
    for (let i = 0; i < GetNumResources(); i++) {
        const name = GetResourceByFindIndex(i);
        if (!name) continue;
        out.push({
            name,
            state: GetResourceState(name),
            version: GetResourceMetadata(name, 'version', 0) || undefined,
            author: GetResourceMetadata(name, 'author', 0) || undefined,
            description: GetResourceMetadata(name, 'description', 0) || undefined,
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
});

route('POST', '/api/resources/refresh', 'resource refresh', (c) => {
    ExecuteCommand('refresh');
    state.did(label(c.staff), 'refreshed resources');
    return { text: 'Refreshed. New and changed resources are picked up.' };
});

route('POST', '/api/resources/:name/:action', undefined, (c) => {
    const name = decodeURIComponent(c.params[0]!);
    const action = c.params[1]!;
    if (!['start', 'stop', 'restart'].includes(action)) throw new Refused('Unknown action.');
    need(c, `resource ${action}`);
    if (GetResourceState(name) === 'missing') throw new Refused(`There is no resource called ${name}.`);
    if (name === resource && action !== 'restart') throw new Refused('The panel can only restart itself.');

    // `ensure` restarts a running resource and starts a stopped one
    const go = () => (action === 'start' ? StartResource(name) : action === 'stop' ? StopResource(name) : ExecuteCommand(`ensure ${name}`));
    // the panel restarting itself has to answer first
    if (name === resource) setTimeout(go, 500);
    else go();

    state.did(label(c.staff), `${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'restarted'} ${name}`);
    fivecord.log('resources', `${action} ${name}`, `From the panel by **${label(c.staff)}**`);
    return { text: `${name}: ${GetResourceState(name)}` };
});

// ------------------------------------------------------------------ server

route('GET', '/api/server', 'server status', async (c) => {
    if (fivecord.running()) return { via: 'fivecord', ...(await fivecord.call('status', [], c.staff)) };
    return { via: 'panel', weatherTypes: config.weatherTypes };
});

const serverKeys: Record<string, string> = {
    lock: 'server lock', unlock: 'server unlock', restart: 'server restart', cancelRestart: 'server cancelrestart',
    kickall: 'server kickall', announce: 'announce', weather: 'server weather', time: 'server time',
};

route('POST', '/api/server/:action', undefined, async (c) => {
    const action = c.params[0]!;
    const args: unknown[] = Array.isArray(c.body?.args) ? c.body.args : [];
    const key = serverKeys[action];
    if (!key) throw new Refused('Unknown action.');

    if (fivecord.running()) {
        const r = await fivecord.call('server', [action, ...args], c.staff);
        state.did(label(c.staff), r.text);
        return r;
    }

    need(c, key);
    const fill = (t: string, v: Record<string, unknown>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
    switch (action) {
        case 'weather': {
            const type = String(args[0]).toUpperCase();
            ExecuteCommand(fill(config.weatherCommand, { type, weather: type }));
            state.did(label(c.staff), `set the weather to ${type}`);
            return { text: `Weather set to ${type.toLowerCase()}.` };
        }
        case 'time': {
            const hour = Math.max(0, Math.min(23, Number(args[0]) || 0));
            const minute = Math.max(0, Math.min(59, Number(args[1]) || 0));
            ExecuteCommand(fill(config.timeCommand, { hour, minute }));
            state.did(label(c.staff), `set the time to ${hour}:${String(minute).padStart(2, '0')}`);
            return { text: 'Time set.' };
        }
        case 'announce':
            emitNet('chat:addMessage', -1, { color: [156, 44, 241], multiline: true, args: [String(args[0]).slice(0, 100), String(args[1]).slice(0, 500)] });
            state.did(label(c.staff), `announced "${args[0]}"`);
            return { text: 'Announced in chat.' };
        case 'kickall': {
            const list = GetPlayers();
            for (const id of list) DropPlayer(id, String(args[0] || 'Kicked by staff'));
            state.did(label(c.staff), `kicked everyone (${list.length})`);
            return { text: `Kicked ${list.length} players.` };
        }
    }
    throw new Refused('This needs fivecord running on the server.');
});

// ------------------------------------------------------------------ dispatch

export async function dispatch(req: IncomingMessage, url: URL, staff: Staff, body: unknown) {
    for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.path);
        if (!m) continue;
        const access = await of(staff);
        if (access.tier < 0) throw new Denied('You are not staff on this server.');
        const c: Ctx = { staff, access, params: m.slice(1), query: url.searchParams, body };
        if (r.key) need(c, r.key);
        return r.run(c);
    }
    return undefined;
}
