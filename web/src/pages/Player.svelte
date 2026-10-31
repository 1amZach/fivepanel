<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api, enc } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { ago, date, duration, money } from '../lib/format';
    import { live } from '../lib/live.svelte';
    import { go, href } from '../lib/router.svelte';
    import { can, has } from '../lib/session.svelte';

    let { ref }: { ref: string } = $props();

    let p = $state<any>(null);
    let error = $state('');
    let shot = $state<string | null>(null);
    let busy = $state(false);

    async function load() {
        try {
            p = await api(`/api/player/${enc(ref)}`);
            error = '';
        } catch (e) {
            error = (e as Error).message;
        }
    }
    onMount(load);

    const online = $derived(Boolean(p?.online));
    const full = $derived(has('fivecord'));
    // the ref to act on: their server id while online, otherwise their license
    const target = $derived(p?.online ? `@${p.online.src}` : p?.license ? `#${p.license.replace(/^license:/, '')}` : ref);

    async function run(action: string, args: unknown[] = []) {
        busy = true;
        const r: any = await act(`/api/player/${enc(target)}/${action}`, { args });
        busy = false;
        if (r?.image) shot = r.image;
        if (r) load();
        return r;
    }

    async function withReason(action: string, title: string, confirm: string, danger = false) {
        const v = await ask(title, [{ name: 'reason', label: 'Reason', required: true }], { confirm, danger });
        if (v) run(action, [v.reason]);
    }

    async function message() {
        const v = await ask(`Message ${p.name}`, [{ name: 'text', label: 'Shown on their screen', type: 'textarea', required: true }], { confirm: 'Send' });
        if (v) run('message', [v.text]);
    }

    async function ban() {
        const v = await ask(`Ban ${p.name}`, [
            { name: 'length', label: 'Length', type: 'select', options: [
                { value: '1d', label: '1 day' }, { value: '3d', label: '3 days' }, { value: '1w', label: '1 week' },
                { value: '2w', label: '2 weeks' }, { value: '30d', label: '30 days' }, { value: 'perm', label: 'Permanent' },
            ] },
            { name: 'reason', label: 'Reason', required: true },
        ], { confirm: 'Ban', danger: true, text: online ? 'They are kicked straight away.' : 'They are blocked next time they try to join.' });
        if (v) run('ban', [v.length, v.reason]);
    }

    async function teleport() {
        const others = live.players.filter((x) => x.src !== p.online?.src);
        const v = await ask(`Teleport ${p.name}`, [
            { name: 'to', label: 'To', type: 'select', options: [{ value: '', label: 'Coordinates below' }, ...others.map((o) => ({ value: String(o.src), label: `${o.name} (${o.src})` }))] },
            { name: 'coords', label: 'Coordinates', placeholder: '215.8, -810.1, 30.7' },
        ], { confirm: 'Teleport' });
        if (!v) return;
        if (v.to) return run('bring', [`@${v.to}`]);
        const xyz = v.coords.split(/[\s,]+/).filter(Boolean).map(Number);
        run('teleport', [xyz[0], xyz[1], xyz[2] ?? 30]);
    }

    async function note() {
        const v = await ask(`Note on ${p.name}`, [{ name: 'text', label: 'Only staff see this', type: 'textarea', required: true }], { confirm: 'Add note' });
        if (v) run('note', [v.text]);
    }

    async function remove(kind: 'warning' | 'note', id: number) {
        const v = await ask(`Remove this ${kind}?`, [], { confirm: 'Remove', danger: true });
        if (v && (await act(`/api/entry/${kind}/${id}`, undefined, 'DELETE'))) load();
    }

    const cash = (m: Record<string, number> = {}) =>
        Object.entries(m).filter(([k]) => ['cash', 'money', 'bank', 'black_money', 'crypto'].includes(k));
</script>

<a class="back muted" href={href('players')}>‹ Players</a>

{#if error}
    <div class="notice">{error}</div>
{:else if !p}
    <div class="empty">Loading…</div>
{:else}
    <div class="head card">
        <div>
            <h1>{p.name}</h1>
            <div class="row muted small">
                {#if online}
                    <span class="badge green">Online · id {p.online.src}</span>
                    <span>{p.online.ping}ms</span>
                    {#if p.online.joined}<span>on for {duration(Date.now() / 1000 - p.online.joined)}</span>{/if}
                    {#if p.online.frozen}<span class="badge teal">frozen</span>{/if}
                {:else}
                    <span class="badge">Offline</span>
                    {#if p.record}<span>last seen {ago(p.record.lastSeen)}</span>{/if}
                {/if}
                {#if p.bans?.some((b: any) => b.active)}<span class="badge red">Banned</span>{/if}
                {#if p.discord}<span class="mono">Discord {p.discord}</span>{/if}
            </div>
        </div>

        <div class="row actions">
            {#if online && can('message')}<button class="btn" disabled={busy} onclick={message}>Message</button>{/if}
            {#if full && can('warn')}<button class="btn" disabled={busy} onclick={() => withReason('warn', `Warn ${p.name}`, 'Warn')}>Warn</button>{/if}
            {#if online && full && can('revive')}<button class="btn" disabled={busy} onclick={() => run('revive')}>Revive</button>{/if}
            {#if online && full && can('heal')}<button class="btn" disabled={busy} onclick={() => run('heal')}>Heal</button>{/if}
            {#if online && full && can('teleport')}<button class="btn" disabled={busy} onclick={teleport}>Teleport</button>{/if}
            {#if online && full && can('freeze')}<button class="btn" disabled={busy} onclick={() => run('freeze', [!p.online.frozen])}>{p.online.frozen ? 'Unfreeze' : 'Freeze'}</button>{/if}
            {#if online && can('screenshot') && has('screenshots')}<button class="btn" disabled={busy} onclick={() => run('screenshot')}>Screenshot</button>{/if}
            {#if online && full && can('kill')}<button class="btn danger" disabled={busy} onclick={() => run('kill')}>Kill</button>{/if}
            {#if online && can('kick')}<button class="btn danger" disabled={busy} onclick={() => withReason('kick', `Kick ${p.name}`, 'Kick', true)}>Kick</button>{/if}
            {#if full && can('ban')}<button class="btn danger" disabled={busy} onclick={ban}>Ban</button>{/if}
        </div>
    </div>

    {#if shot}
        <div class="card shot">
            <h2>Screenshot <button class="btn small ghost" onclick={() => (shot = null)}>Close</button></h2>
            <img src={shot} alt="What {p.name} sees" />
        </div>
    {/if}

    {#if !full}
        <div class="notice">Warnings, notes, bans and character info need fivecord running on the server.</div>
    {/if}

    <div class="grid cols">
        {#if p.record}
            <div class="card">
                <h2>Account</h2>
                <div class="stack">
                    <div class="spread"><span class="muted">First seen</span><span>{date(p.record.firstSeen)}</span></div>
                    <div class="spread"><span class="muted">Playtime</span><span>{duration(p.record.playtime)}</span></div>
                    <div class="spread"><span class="muted">Warnings</span><span>{p.warnings.length}</span></div>
                    <div class="spread"><span class="muted">Bans</span><span>{p.bans.length}</span></div>
                </div>
            </div>
        {/if}

        {#if p.character}
            <div class="card">
                <h2>Character</h2>
                <div class="stack">
                    <div class="spread"><strong>{p.character.name}</strong><span class="mono faint">{p.character.id}</span></div>
                    <div class="spread"><span class="muted">Job</span><span>{p.character.jobLabel} · {p.character.gradeLabel}</span></div>
                    {#if p.character.gang && p.character.gang !== 'none'}<div class="spread"><span class="muted">Gang</span><span>{p.character.gangLabel ?? p.character.gang}</span></div>{/if}
                    {#each cash(p.character.money) as [k, v]}
                        <div class="spread"><span class="muted">{k.replace('_', ' ')}</span><span class="mono">{money(v)}</span></div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if p.vehicles}
            <div class="card">
                <h2>Vehicles <span class="muted small">{p.vehicles.length}</span></h2>
                <div class="row">
                    {#each p.vehicles as plate}<span class="badge mono">{plate}</span>{:else}<span class="faint">None</span>{/each}
                </div>
            </div>
        {/if}
    </div>

    {#if full}
        <div class="grid cols">
            <div class="card">
                <h2>Warnings</h2>
                <div class="list">
                    {#each p.warnings as w}
                        <div class="item">
                            <div><div>{w.text}</div><div class="small faint">{w.staff} · {date(w.created)}</div></div>
                            {#if can('warnings remove')}<button class="btn small ghost" onclick={() => remove('warning', w.id)}>Remove</button>{/if}
                        </div>
                    {:else}<div class="empty">No warnings.</div>{/each}
                </div>
            </div>

            <div class="card">
                <h2>Staff notes {#if can('note add')}<button class="btn small" onclick={note}>Add</button>{/if}</h2>
                <div class="list">
                    {#each p.notes as n}
                        <div class="item">
                            <div><div>{n.text}</div><div class="small faint">{n.staff} · {date(n.created)}</div></div>
                            {#if can('note remove')}<button class="btn small ghost" onclick={() => remove('note', n.id)}>Remove</button>{/if}
                        </div>
                    {:else}<div class="empty">No notes.</div>{/each}
                </div>
            </div>

            <div class="card">
                <h2>Bans</h2>
                <div class="list">
                    {#each p.bans as b}
                        <div class="item">
                            <div>
                                <div>#{b.id} · {b.reason}</div>
                                <div class="small faint">{b.staff} · {date(b.created)} · {b.expires ? `until ${date(b.expires)}` : 'permanent'}</div>
                            </div>
                            {#if b.active}<span class="badge red">active</span>{:else if b.revokedBy}<span class="badge">lifted</span>{:else}<span class="badge">expired</span>{/if}
                        </div>
                    {:else}<div class="empty">Never banned.</div>{/each}
                </div>
            </div>
        </div>

        {#if p.identifiers?.length}
            <div class="card ids">
                <h2>Identifiers</h2>
                <div class="row">{#each p.identifiers as id}<code class="badge">{id}</code>{/each}</div>
            </div>
        {/if}
    {/if}

    {#if online && can('where')}
        <div class="row small faint where">
            Position {p.online.pos?.map((n: number) => n.toFixed(1)).join(', ')} · <a href={href('map')} onclick={() => go('map')}>show on map</a>
        </div>
    {/if}
{/if}

<style>
    .back { display: inline-block; margin-bottom: 12px; }
    .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .head h1 { margin-bottom: 6px; }
    .actions { justify-content: flex-end; }
    .cols { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 16px; }
    .notice { margin-top: 16px; }
    .shot img { width: 100%; border-radius: 8px; display: block; }
    .shot { margin-bottom: 16px; }
    .ids { margin-top: 16px; }
    .ids code { font-size: 12px; }
    .where { margin-top: 14px; }
    .where a { text-decoration: underline; }
</style>
