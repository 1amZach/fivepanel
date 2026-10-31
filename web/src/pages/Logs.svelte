<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '../lib/api';
    import { logKinds } from '../lib/format';
    import LogTable from '../lib/LogTable.svelte';
    import { listen } from '../lib/live.svelte';
    import { go } from '../lib/router.svelte';

    let { player = '' }: { player?: string } = $props();

    let rows = $state<any[]>([]);
    let kind = $state('');
    let q = $state('');
    let day = $state('');
    let loading = $state(false);
    let more = $state(false);
    let error = $state('');
    let paused = $state(false);

    const PAGE = 100;

    function params(before?: number) {
        const p = new URLSearchParams({ limit: String(PAGE) });
        if (kind) p.set('kind', kind);
        if (q.trim()) p.set('q', q.trim());
        if (player) p.set('player', player);
        if (day) {
            const from = new Date(`${day}T00:00:00`).getTime() / 1000;
            p.set('from', String(from));
            p.set('to', String(from + 86399));
        }
        if (before) p.set('before', String(before));
        return p;
    }

    async function load(next = false) {
        loading = true;
        try {
            const got = await api<any[]>(`/api/logs?${params(next ? rows[rows.length - 1]?.id : undefined)}`);
            rows = next ? [...rows, ...got] : got;
            more = got.length === PAGE;
            error = '';
        } catch (e) {
            error = (e as Error).message;
        }
        loading = false;
    }

    let timer: ReturnType<typeof setTimeout>;
    $effect(() => {
        kind;
        day;
        player;
        q;
        clearTimeout(timer);
        timer = setTimeout(() => load(), 250);
    });

    // new lines that match what's shown, while looking at the latest ones
    const matches = (e: any) =>
        !day &&
        (!kind || e.kind === kind) &&
        (!player || e.license === player || e.target === player) &&
        (!q.trim() || String(e.text).toLowerCase().includes(q.trim().toLowerCase()));

    onMount(() => listen('log', (e) => {
        if (!paused && matches(e)) rows = [e, ...rows].slice(0, 1000);
    }));
</script>

<div class="page-head">
    <h1>Logs</h1>
    <div class="row filters">
        <select bind:value={kind}>
            <option value="">Everything</option>
            {#each Object.entries(logKinds) as [k, v]}<option value={k}>{v.label}</option>{/each}
        </select>
        <input type="date" bind:value={day} />
        <input placeholder="Search text" bind:value={q} />
        <label class="row small muted"><input type="checkbox" bind:checked={paused} /> Pause live</label>
    </div>
</div>

{#if player}
    <div class="row filter">
        <span class="badge brand">Player {player.replace(/^license:/, '').slice(0, 12)}…</span>
        <button class="btn small ghost" onclick={() => go('logs')}>Show everyone</button>
    </div>
{/if}

{#if error}<div class="card notice">{error}</div>{/if}

<div class="card">
    <LogTable {rows} empty={loading ? 'Loading…' : 'Nothing matches.'} />
    {#if more}
        <div class="row center"><button class="btn" disabled={loading} onclick={() => load(true)}>Older</button></div>
    {/if}
</div>

<style>
    select, input[type='date'] { width: auto; }
    .filters input:not([type]) { width: 220px; }
    @media (max-width: 860px) {
        .filters input:not([type]) { width: 100%; }
    }
    label input { width: auto; }
    .filter { margin-bottom: 12px; }
    .notice { margin-bottom: 16px; color: #ff8d90; }
    .center { justify-content: center; margin-top: 12px; }
</style>
