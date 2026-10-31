// Discord login. The session is a signed cookie, so it survives a restart.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config';
import type { Staff } from './fivecord';

const COOKIE = 'fivepanel';
const STATE = 'fivepanel_state';
const HOURS = 12;

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (data: string) => createHmac('sha256', config.secret).update(data).digest('base64url');

function same(a: string, b: string) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

export function seal(value: object, seconds: number) {
    const data = b64(JSON.stringify({ ...value, exp: Math.floor(Date.now() / 1000) + seconds }));
    return `${data}.${sign(data)}`;
}

export function unseal<T>(token?: string): T | undefined {
    if (!token) return undefined;
    const [data, mac] = token.split('.');
    if (!data || !mac || !same(mac, sign(data))) return undefined;
    try {
        const v = JSON.parse(Buffer.from(data, 'base64url').toString());
        return v.exp > Date.now() / 1000 ? v : undefined;
    } catch {
        return undefined;
    }
}

export function cookies(req: IncomingMessage): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function setCookie(res: ServerResponse, name: string, value: string, seconds: number) {
    const secure = config.url.startsWith('https://') ? '; Secure' : '';
    const list = ([] as string[]).concat((res.getHeader('Set-Cookie') as string[]) ?? []);
    list.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`);
    res.setHeader('Set-Cookie', list);
}

export const staffOf = (req: IncomingMessage) => unseal<Staff>(cookies(req)[COOKIE]);

const redirect = (res: ServerResponse, to: string) => {
    res.writeHead(302, { Location: to });
    res.end();
};

const callback = () => `${config.url}/auth/callback`;

export function login(res: ServerResponse) {
    if (!config.discord.id || !config.discord.secret) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Discord login is not set up. Set fivepanel_discord_id and fivepanel_discord_secret in server.cfg.');
    }
    const state = randomBytes(16).toString('hex');
    setCookie(res, STATE, seal({ state }, 600), 600);
    const q = new URLSearchParams({ client_id: config.discord.id, redirect_uri: callback(), response_type: 'code', scope: 'identify', state, prompt: 'none' });
    redirect(res, `https://discord.com/oauth2/authorize?${q}`);
}

export async function finish(req: IncomingMessage, res: ServerResponse, url: URL) {
    const expected = unseal<{ state: string }>(cookies(req)[STATE]);
    const code = url.searchParams.get('code');
    if (!code || !expected || url.searchParams.get('state') !== expected.state) return redirect(res, '/?error=login');

    const token = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.discord.id, client_secret: config.discord.secret, grant_type: 'authorization_code', code, redirect_uri: callback() }),
    }).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined);
    if (!token?.access_token) return redirect(res, '/?error=login');

    const user = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } })
        .then((r) => (r.ok ? r.json() : undefined))
        .catch(() => undefined);
    if (!user?.id) return redirect(res, '/?error=login');

    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : undefined;
    const staff: Staff = { id: String(user.id), name: user.global_name ?? user.username, avatar };
    setCookie(res, STATE, '', 0);
    setCookie(res, COOKIE, seal(staff, HOURS * 3600), HOURS * 3600);
    redirect(res, '/');
}

export function logout(res: ServerResponse) {
    setCookie(res, COOKIE, '', 0);
    redirect(res, '/');
}
