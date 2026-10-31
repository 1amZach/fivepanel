<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '../lib/api';
    import { ago, clock, duration, labels } from '../lib/format';
    import { listen, live } from '../lib/live.svelte';
    import { href } from '../lib/router.svelte';
    import { can } from '../lib/session.svelte';

    let data = $state<any>(null);
    let error = $state('');

    async function load() {
        try {
            data = await api('/api/overview');
        } catch (e) {
            error = (e as Error).message;
        }
    }

    onMount(() => {
        load();
        const stops = [
            listen('visit', (v) => data && (data.visits = [v, ...data.visits].slice(0, 25))),
            listen('detection', (d) => data && (data.detections = [d, ...data.detections].slice(0, 10))),
            listen('activity', (a) => data && (data.activity = [a, ...data.activity].slice(0, 15))),
        ];
        const timer = setInterval(load, 60_000);
        return () => (stops.forEach((s) => s()), clearInterval(timer));
    });

    const stats = $derived(live.stats ?? data?.stats);

    // players over time, drawn as a line
    const chart = $derived.by(() => {
        const points: { at: number; players: number }[] = data?.history ?? [];
        if (points.length < 2) return null;
        const w = 600, h = 120;
        const max = Math.max(stats?.maxPlayers ?? 1, ...points.map((p) => p.players), 1);
        const t0 = points[0]!.at, t1 = points.at(-1)!.at;
        const xy = points.map((p) => [((p.at - t0) / Math.max(1, t1 - t0)) * w, h - (p.players / max) * (h - 8) - 4]);
        const line = xy.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');
        return { w, h, line, area: `0,${h} ${line} ${w},${h}`, peak: Math.max(...points.map((p) => p.players)), since: t0 };
    });

    const tickColor = (ms: number) => (ms > 80 ? 'red' : ms > 60 ? 'amber' : 'green');
</script>

<div class="page-head">
    <h1>Dashboard</h1>
</div>

{#if error}<div class="notice">{error}</div>{/if}

<div class="grid stats">
    <div class="card stat">
        <span class="muted small">Players</span>
        <strong>{stats?.players ?? '–'}<span class="faint"> / {stats?.maxPlayers ?? '–'}</span></strong>
    </div>
    <div class="card stat">
        <span class="muted small">Server tick</span>
        <strong>{stats ? `${stats.tick.avg}ms` : '–'}</strong>
        {#if stats}<span class="badge {tickColor(stats.tick.avg)}">worst {stats.tick.worst}ms</span>{/if}
    </div>
    <div class="card stat">
        <span class="muted small">Panel memory</span>
        <strong>{stats ? `${stats.memory} MB` : '–'}</strong>
    </div>
    <div class="card stat">
        <span class="muted small">Up for</span>
        <strong>{stats ? duration(stats.uptime) : '–'}</strong>
    </div>
</div>

<div class="grid two">
    <div class="card">
        <h2>Players today {#if chart}<span class="muted small">peak {chart.peak} · since {clock(chart.since)}</span>{/if}</h2>
        {#if chart}
            <svg viewBox="0 0 {chart.w} {chart.h}" preserveAspectRatio="none" class="chart" role="img" aria-label="Player count over time">
                <defs>
                    <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stop-color="#9c2cf1" stop-opacity="0.35" />
                        <stop offset="1" stop-color="#9c2cf1" stop-opacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={chart.area} fill="url(#fill)" />
                <polyline points={chart.line} fill="none" stroke="#9c2cf1" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
        {:else}
            <div class="empty">The chart fills in a minute after the panel starts.</div>
        {/if}
    </div>

    <div class="card">
        <h2>Server</h2>
        {#if data?.status}
            <div class="stack">
                <div class="spread"><span class="muted">Joining</span>
                    {#if data.status.lock.on}<span class="badge amber">Locked · {data.status.lock.reason}</span>{:else}<span class="badge green">Open</span>{/if}
                </div>
                <div class="spread"><span class="muted">Next restart</span>
                    <span>{data.status.restart ? `${ago(data.status.restart.at)}` : 'none planned'}</span>
                </div>
                <div class="spread"><span class="muted">Open reports</span>
                    <a href={href('reports')}>{data.status.reports}</a>
                </div>
            </div>
        {:else}
            <div class="empty">Lock, restarts and reports show here when fivecord is running.</div>
        {/if}
    </div>
</div>

<div class="grid three">
    <div class="card">
        <h2>Joins and leaves</h2>
        <div class="list">
            {#each data?.visits ?? [] as v}
                <div class="item">
                    <span><span class="dot" class:on={v.kind === 'join'} class:off={v.kind === 'leave'}></span>&nbsp; {v.name} <span class="faint">({v.src})</span></span>
                    <span class="faint small" title={v.reason}>{ago(v.at)}</span>
                </div>
            {:else}<div class="empty">Nobody yet.</div>{/each}
        </div>
    </div>

    {#if can('bans')}
        <div class="card">
            <h2>Anticheat <a class="small muted" href={href('anticheat')}>All</a></h2>
            <div class="list">
                {#each data?.detections ?? [] as d}
                    <div class="item">
                        <span>{d.name} · {labels[d.kind] ?? d.kind}</span>
                        <span class="badge {d.action === 'ban' ? 'red' : d.action === 'kick' ? 'amber' : ''}">{d.action}</span>
                    </div>
                {:else}<div class="empty">Nothing detected.</div>{/each}
            </div>
        </div>
    {/if}

    <div class="card">
        <h2>Staff activity</h2>
        <div class="list">
            {#each data?.activity ?? [] as a}
                <div class="item">
                    <span><strong>{a.staff}</strong> <span class="muted">{a.text}</span></span>
                    <span class="faint small">{ago(a.at)}</span>
                </div>
            {:else}<div class="empty">Actions taken in the panel show up here.</div>{/each}
        </div>
    </div>
</div>

<style>
    .grid + .grid { margin-top: 16px; }
    .stats { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .stat { display: flex; flex-direction: column; gap: 4px; }
    .stat strong { font-size: 26px; font-weight: 650; }
    .stat .badge { align-self: flex-start; }
    .two { grid-template-columns: 2fr 1fr; }
    .three { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .chart { width: 100%; height: 140px; display: block; }
    .item span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    @media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
</style>
