import { aces, addPlayer, commands, consoleListeners, dropped, fire, net, players, states, wardenUnbanned } from './env';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { WebSocket } from 'ws';

import { can, forget, of } from '../src/access';
import { seal, unseal } from '../src/auth';
import { load, setConfig } from '../src/config';
import { makeServer } from '../src/http';
import { startLive } from '../src/live';
import { root } from './env';

setConfig(load());

const owner = { id: '111111111111111111', name: 'Zach' };
const support = { id: '222222222222222222', name: 'Sam' };
const nobody = { id: '333333333333333333', name: 'Nobody' };
const cookie = (staff: object) => `fivepanel=${encodeURIComponent(seal(staff, 3600))}`;

let base = '';
const server = makeServer(`${root}/web/dist`);
startLive(server);

before(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function call(path: string, staff?: object, method = 'GET', body?: unknown, headers: Record<string, string> = { 'X-Fivepanel': '1' }) {
    const res = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { ...(staff ? { Cookie: cookie(staff) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, res };
}

describe('sessions', () => {
    test('a sealed cookie round-trips and tampering breaks it', () => {
        const t = seal(owner, 60);
        assert.equal(unseal<any>(t)!.id, owner.id);
        const [data, mac] = t.split('.');
        const forged = Buffer.from(JSON.stringify({ ...owner, id: '1', exp: 9e9 })).toString('base64url');
        assert.equal(unseal(`${forged}.${mac}`), undefined);
        assert.equal(unseal(`${data}.x${mac!.slice(1)}`), undefined);
        assert.equal(unseal(seal(owner, -1)), undefined, 'expired');
    });

    test('the signing key is made once and kept', () => {
        const a = load().secret;
        assert.equal(load().secret, a);
        assert.ok(a.length >= 32);
    });
});

describe('access without fivecord', () => {
    test('config.json staff list and aces both work', async () => {
        assert.equal((await of(owner)).tierName, 'owner');
        assert.equal((await of(support)).tierName, 'support');
        assert.equal((await of(nobody)).tier, -1);

        aces.add('identifier.discord:333333333333333333 fivepanel.admin');
        forget();
        assert.equal((await of(nobody)).tierName, 'admin');
        aces.clear();
        forget();
    });

    test('defaults match fivecord', async () => {
        const s = await of(support);
        assert.ok(can(s, 'players'));
        assert.ok(!can(s, 'kick'));
        assert.ok(!can(s, 'console'));
        assert.ok(can(await of(owner), 'console'));
    });
});

describe('http', () => {
    test('api needs a login, and non-staff are turned away', async () => {
        assert.equal((await call('/api/me')).status, 401);
        const r = await call('/api/me', nobody);
        assert.equal(r.status, 403);
        assert.match(r.json.error, /not staff/);
    });

    test('me', async () => {
        const r = await call('/api/me', owner);
        assert.equal(r.status, 200);
        assert.equal(r.json.access.tierName, 'owner');
        assert.equal(r.json.features.fivecord, false);
    });

    test('posts need the panel header so other sites cannot post', async () => {
        const r = await call('/api/console', owner, 'POST', { command: 'quit' }, {});
        assert.equal(r.status, 403);
        assert.ok(!commands.includes('quit'));
    });

    test('permissions are checked per route', async () => {
        assert.equal((await call('/api/console', support)).status, 403);
        assert.equal((await call('/api/resources', support)).status, 200);
        assert.equal((await call('/api/resources/ox_lib/stop', support, 'POST', {})).status, 403);
    });

    test('console', async () => {
        consoleListeners[0]!('citizen-server-impl', '^2Started ^7resource ox_lib');
        const lines = (await call('/api/console', owner)).json;
        assert.equal(lines.at(-1).text, 'Started resource ox_lib');
        assert.equal((await call('/api/console', owner, 'POST', { command: 'status' })).status, 200);
        assert.equal(commands.at(-1), 'status');
    });

    test('resources', async () => {
        const list = (await call('/api/resources', owner)).json;
        assert.deepEqual(list.map((r: any) => r.name), ['fivecord', 'fivepanel', 'old_hud', 'ox_lib', 'warden']);
        assert.equal(list.find((r: any) => r.name === 'ox_lib').version, '3.30.0');

        await call('/api/resources/ox_lib/stop', owner, 'POST', {});
        assert.equal(states.ox_lib, 'stopped');
        await call('/api/resources/ox_lib/start', owner, 'POST', {});
        assert.equal(states.ox_lib, 'started');
        await call('/api/resources/ox_lib/restart', owner, 'POST', {});
        assert.equal(commands.at(-1), 'ensure ox_lib');
        assert.equal((await call('/api/resources/fivepanel/stop', owner, 'POST', {})).status, 400);
        assert.equal((await call('/api/resources/nope/start', owner, 'POST', {})).status, 400);
    });

    test('players and actions that work without fivecord', async () => {
        addPlayer(5, 'Alex', [10.04, 20, 30]);
        const list = (await call('/api/players', owner)).json;
        assert.deepEqual(list[0], { src: 5, name: 'Alex', ping: 42, pos: [10, 20, 30], license: 'license:alex', discord: '95' });

        const profile = (await call(`/api/player/${encodeURIComponent('@5')}`, owner)).json;
        assert.equal(profile.online.src, 5);

        await call(`/api/player/${encodeURIComponent('@5')}/message`, owner, 'POST', { args: ['Hi'] });
        assert.equal(net.at(-1)!.event, 'chat:addMessage');

        const warn = await call(`/api/player/${encodeURIComponent('@5')}/warn`, owner, 'POST', { args: ['x'] });
        assert.equal(warn.status, 400);
        assert.match(warn.json.error, /fivecord/);

        assert.equal((await call(`/api/player/${encodeURIComponent('@5')}/kick`, support, 'POST', { args: ['x'] })).status, 403);
        await call(`/api/player/${encodeURIComponent('@5')}/kick`, owner, 'POST', { args: ['AFK'] });
        assert.equal(dropped.at(-1)!.reason, 'Kicked by staff: AFK');
        assert.ok(!players.has(5));
    });

    test('warden bans and detections', async () => {
        states.warden = 'started';
        const bans = (await call('/api/bans', owner)).json;
        assert.equal(bans.source, 'warden');
        assert.equal(bans.bans[0].name, 'Cheater');
        await call('/api/bans/3/unban', owner, 'POST', { source: 'warden' });
        assert.deepEqual(wardenUnbanned.at(-1), [3, 'Zach']);

        addPlayer(6, 'Sus');
        fire('warden:detected', undefined, 6, 'freecam', 'Camera 300m away', 'log');
        fire('warden:punished', undefined, 6, 'ban', 'honeypot', 'esx:giveMoney', 'Sus', 'license:sus', 'data:image/jpeg;base64,AAAA');
        const feed = (await call('/api/detections', owner)).json;
        assert.equal(feed[0].kind, 'honeypot');
        assert.equal(feed[0].image, undefined, 'images are fetched one at a time');
        assert.equal(feed[0].hasImage, true);
        assert.equal((await call(`/api/detections/${feed[0].id}/image`, owner)).json.image, 'data:image/jpeg;base64,AAAA');
        assert.equal((await call(`/api/detections/${feed[1].id}/dismiss`, owner, 'POST', {})).status, 200);
        states.warden = 'missing';
    });

    test('server controls without fivecord', async () => {
        await call('/api/server/weather', owner, 'POST', { args: ['rain'] });
        assert.equal(commands.at(-1), 'weather RAIN');
        await call('/api/server/time', owner, 'POST', { args: [25, 5] });
        assert.equal(commands.at(-1), 'time 23 5');
        assert.equal((await call('/api/server/lock', owner, 'POST', { args: [] })).status, 400);
    });

    test('logs search goes to fivelog, mods and up', async () => {
        assert.equal((await call('/api/logs', owner)).status, 400, 'needs fivelog');
        states.fivelog = 'started';
        let asked: any;
        globalThis.on('fivelog:query', (id: number, filter: any) => {
            asked = filter;
            fire('fivelog:query:done', undefined, id, true, [{ id: 1, kind: 'deaths', text: 'Al killed Bob' }]);
        });
        const r = await call('/api/logs?kind=deaths,damage&player=license:bob&q=killed&limit=999', owner);
        assert.equal(r.json[0].text, 'Al killed Bob');
        assert.deepEqual(asked, { kind: ['deaths', 'damage'], player: 'license:bob', q: 'killed', before: undefined, from: undefined, to: undefined, limit: 200 });
        assert.equal((await call('/api/logs', support)).status, 403);
        assert.equal((await call('/api/me', owner)).json.features.fivelog, true);
        states.fivelog = 'missing';
    });

    test('updates go to fiveupdate, owners only for changes', async () => {
        assert.equal((await call('/api/updates', owner)).status, 400, 'needs fiveupdate');
        states.fiveupdate = 'started';
        const asked: unknown[][] = [];
        globalThis.on('fiveupdate:api', (id: number, action: string, ...args: unknown[]) => {
            asked.push([action, ...args]);
            const reply: Record<string, unknown> = {
                list: { checked: 1, resources: [{ name: 'warden', version: '1.0.2', latest: '1.0.3' }] },
                preview: { name: 'warden', from: '1.0.2', to: '1.0.3', files: [{ path: 'config.lua', action: 'merge' }] },
                update: { from: '1.0.2', to: '1.0.3', restarted: false },
                undo: { from: '1.0.3', to: '1.0.2', skipped: ['a.lua'] },
            };
            if (args[0] === 'broken') fire('fiveupdate:api:done', undefined, id, false, 'broken has no releases');
            else fire('fiveupdate:api:done', undefined, id, true, reply[action]);
        });
        assert.equal((await call('/api/updates', support)).json.resources[0].latest, '1.0.3', 'support can see them');
        assert.equal((await call('/api/updates/warden', support)).status, 403);
        assert.equal((await call('/api/updates/warden/apply', support, 'POST', {})).status, 403);
        assert.equal((await call('/api/updates/warden', owner)).json.files[0].action, 'merge');
        const done = await call('/api/updates/warden/apply', owner, 'POST', {});
        assert.match(done.json.text, /updated to 1\.0\.3\. Restart it/);
        const back = await call('/api/updates/warden/undo', owner, 'POST', {});
        assert.match(back.json.text, /back to 1\.0\.2.*1 file changed since/);
        const bad = await call('/api/updates/broken', owner);
        assert.deepEqual([bad.status, bad.json.error], [400, 'broken has no releases']);
        assert.equal((await call('/api/updates/warden/delete', owner, 'POST', {})).status, 400);
        assert.deepEqual(asked.map((a) => a[0]), ['list', 'preview', 'update', 'undo', 'preview']);
        assert.equal((await call('/api/me', owner)).json.features.fiveupdate, true);
        states.fiveupdate = 'missing';
    });

    test('in-game staff activity shows up', async () => {
        fire('fivepanel:activity', undefined, 'Kira (in game)', 'brought Pat to them');
        const list = (await call('/api/activity', owner)).json;
        assert.deepEqual([list[0].staff, list[0].text], ['Kira (in game)', 'brought Pat to them']);
    });

    test('static files, with no way out of the web folder', async () => {
        const index = await call('/');
        assert.match(index.text, /<title>fivepanel/);
        assert.equal(index.res.headers.get('x-frame-options'), 'DENY');
        assert.match((await call('/assets/app.js')).res.headers.get('cache-control')!, /immutable/);
        assert.match((await call('/players/deep/link')).text, /<title>fivepanel/, 'unknown paths get the app');
        for (const p of ['/..%2f..%2fsecret.txt', '/%2e%2e/%2e%2e/secret.txt', '/../secret.txt']) {
            assert.doesNotMatch((await call(p)).text, /do not serve/, p);
        }
    });
});

describe('fivecord', () => {
    test('actions go to fivecord when it runs, with who did them', async () => {
        states.fivecord = 'started';
        forget();
        const seen: unknown[][] = [];
        (globalThis as any).on('fivecord:api', (id: number, action: string, args: unknown[], staff: any) => {
            seen.push([action, args, staff.id]);
            if (action === 'access') return (globalThis as any).emit('fivecord:api:done', id, true, { tier: 1, tierName: 'mod', tiers: ['support', 'mod', 'admin', 'owner'], needs: { kick: 1, console: 3, players: 0 } });
            if (action === 'act') return (globalThis as any).emit('fivecord:api:done', id, false, 'Pat isn\'t online.');
            (globalThis as any).emit('fivecord:api:done', id, true, [{ src: 1, name: 'Pat' }]);
        });

        const me = (await call('/api/me', nobody)).json;
        assert.equal(me.access.via, 'fivecord');
        assert.equal(me.access.tierName, 'mod');

        assert.deepEqual((await call('/api/players', nobody)).json, [{ src: 1, name: 'Pat' }]);
        const kick = await call(`/api/player/${encodeURIComponent('#pat')}/kick`, nobody, 'POST', { args: ['x'] });
        assert.equal(kick.status, 400);
        assert.equal(kick.json.error, "Pat isn't online.");
        assert.deepEqual(seen.at(-1), ['act', ['kick', '#pat', 'x'], nobody.id]);

        assert.equal((await call('/api/console', nobody)).status, 403);
        states.fivecord = 'missing';
        forget();
    });
});

describe('login', () => {
    test('discord oauth', async () => {
        const start = await call('/auth/login');
        assert.equal(start.status, 302);
        const to = new URL(start.res.headers.get('location')!);
        assert.equal(to.host, 'discord.com');
        assert.equal(to.searchParams.get('redirect_uri'), 'http://panel.test/auth/callback');
        const state = to.searchParams.get('state')!;
        const stateCookie = start.res.headers.get('set-cookie')!.split(';')[0]!;

        const realFetch = globalThis.fetch;
        const sent: string[] = [];
        globalThis.fetch = (async (url: any, init?: any) => {
            if (String(url).startsWith(base)) return realFetch(url, init);
            sent.push(String(url));
            if (String(url).endsWith('/token')) {
                assert.match(String(init.body), /code=abc/);
                return new Response(JSON.stringify({ access_token: 'tok' }));
            }
            return new Response(JSON.stringify({ id: '111111111111111111', username: 'zach', global_name: 'Zach', avatar: 'av' }));
        }) as typeof fetch;

        try {
            const bad = await fetch(`${base}/auth/callback?code=abc&state=wrong`, { redirect: 'manual', headers: { Cookie: stateCookie } });
            assert.equal(bad.headers.get('location'), '/?error=login');

            const ok = await fetch(`${base}/auth/callback?code=abc&state=${state}`, { redirect: 'manual', headers: { Cookie: stateCookie } });
            assert.equal(ok.headers.get('location'), '/');
            const session = ok.headers.getSetCookie().find((c) => c.startsWith('fivepanel='))!;
            assert.match(session, /HttpOnly; SameSite=Lax/);
            const staff = unseal<any>(decodeURIComponent(session.split(';')[0]!.slice('fivepanel='.length)));
            assert.equal(staff.name, 'Zach');
            assert.equal(staff.avatar, 'https://cdn.discordapp.com/avatars/111111111111111111/av.png?size=128');
        } finally {
            globalThis.fetch = realFetch;
        }
        assert.equal(sent.length, 2);
    });
});

describe('live', () => {
    test('needs a login, then streams players and console', async () => {
        const ws = `ws${base.slice(4)}/ws`;
        const refused = await new Promise((resolve) => {
            const s = new WebSocket(ws);
            s.on('error', () => resolve(true));
            s.on('open', () => resolve(false));
        });
        assert.equal(refused, true);

        addPlayer(7, 'Live', [1.6, 2.2, 3]);
        const s = new WebSocket(ws, { headers: { Cookie: cookie(owner) } });
        const got: any[] = [];
        s.on('message', (m) => got.push(JSON.parse(String(m))));
        await new Promise((r) => s.on('open', r));
        await new Promise((r) => setTimeout(r, 50));
        consoleListeners[0]!('script:x', 'hello');
        await new Promise((r) => setTimeout(r, 50));
        s.close();

        const playersMsg = got.find((m) => m.channel === 'players');
        assert.deepEqual(playersMsg.data.find((p: any) => p.src === 7).pos, [2, 2, 3]);
        assert.ok(got.some((m) => m.channel === 'stats' && m.data.hostname === 'Test RP'));
        assert.ok(got.some((m) => m.channel === 'console' && m.data.text === 'hello'));
    });

    test('support staff do not get the console stream', async () => {
        const s = new WebSocket(`ws${base.slice(4)}/ws`, { headers: { Cookie: cookie(support) } });
        const got: any[] = [];
        s.on('message', (m) => got.push(JSON.parse(String(m))));
        await new Promise((r) => s.on('open', r));
        consoleListeners[0]!('script:x', 'secret');
        await new Promise((r) => setTimeout(r, 50));
        s.close();
        assert.ok(got.some((m) => m.channel === 'players'));
        assert.ok(!got.some((m) => m.channel === 'console'));
    });
});
