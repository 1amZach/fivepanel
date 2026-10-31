import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { can, of } from './access';
import { Denied, dispatch } from './api';
import { finish, login, logout, staffOf } from './auth';
import { config, resource } from './config';
import { Refused } from './fivecord';
import { clip } from './state';

const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
};

const security = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
};

function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...security });
    res.end(JSON.stringify(body ?? null));
}

// With Range support, so the player can seek.
function sendVideo(req: IncomingMessage, res: ServerResponse, file: string) {
    const size = statSync(file).size;
    const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ...security };
    const m = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) {
        res.writeHead(200, { ...headers, 'Content-Length': String(size) });
        return createReadStream(file).pipe(res);
    }
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    createReadStream(file, { start, end }).pipe(res);
}

function readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => {
            size += c.length;
            if (size > 65536) {
                reject(new Refused('That request is too big.'));
                req.destroy();
            } else chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve(undefined);
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
                reject(new Refused('That request is not valid JSON.'));
            }
        });
        req.on('error', reject);
    });
}

export function webRoot() {
    return join(GetResourcePath(resource), 'web', 'dist');
}

function serveFile(res: ServerResponse, root: string, path: string) {
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, safe);
    if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    if (!existsSync(file)) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('The panel has not been built. Run npm run build, or download the release zip.');
    }
    const asset = file.startsWith(join(root, 'assets') + sep);
    res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': asset ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...security,
    });
    createReadStream(file).pipe(res);
}

export function makeServer(root = webRoot()) {
    return createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://panel');
        try {
            if (url.pathname === '/auth/login') return login(res);
            if (url.pathname === '/auth/callback') return await finish(req, res, url);
            if (url.pathname === '/auth/logout') return logout(res);

            if (url.pathname.startsWith('/api/')) {
                const staff = staffOf(req);
                if (!staff) return json(res, 401, { error: 'Log in first.' });
                // a page on another site can't set this header, so it can't post here
                if (req.method !== 'GET' && req.headers['x-fivepanel'] !== '1') return json(res, 403, { error: 'Missing header.' });
                const body = req.method === 'GET' ? undefined : await readBody(req);
                const out = await dispatch(req, url, staff, body);
                return out === undefined ? json(res, 404, { error: 'Not found.' }) : json(res, 200, out);
            }

            if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });

            // a video clip from fivecapture, for staff allowed to see it
            const clipId = url.pathname.match(/^\/clip\/([0-9a-f]{24})$/)?.[1];
            if (clipId) {
                const staff = staffOf(req);
                const c = clip(clipId);
                if (!staff || !c || !can(await of(staff), c.key) || !existsSync(c.file)) return json(res, 404, { error: 'No such clip.' });
                return sendVideo(req, res, c.file);
            }

            // an optional map picture the server owner put next to the resource
            if (url.pathname === '/map-image') {
                if (!staffOf(req) || !config.map.image) return json(res, 404, { error: 'No map image.' });
                const base = GetResourcePath(resource);
                const file = join(base, normalize(config.map.image));
                if (!file.startsWith(base) || !existsSync(file)) return json(res, 404, { error: 'No map image.' });
                res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'image/jpeg', 'Cache-Control': 'private, max-age=86400', ...security });
                return createReadStream(file).pipe(res);
            }

            serveFile(res, root, decodeURIComponent(url.pathname));
        } catch (err) {
            if (err instanceof Denied) return json(res, 403, { error: err.message });
            if (err instanceof Refused) return json(res, 400, { error: err.message });
            console.error(`fivepanel: ${req.method} ${url.pathname} failed: ${(err as Error).stack}`);
            json(res, 500, { error: 'Something went wrong on the server.' });
        }
    });
}
