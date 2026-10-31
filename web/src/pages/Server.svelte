<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { ago, date } from '../lib/format';
    import { can, has } from '../lib/session.svelte';

    let s = $state<any>(null);
    let weather = $state('');
    let hour = $state(12);
    let minute = $state(0);

    async function load() {
        s = await api('/api/server').catch(() => s);
        weather ||= s?.weatherTypes?.[0] ?? '';
    }
    onMount(load);

    const run = async (action: string, args: unknown[] = []) => {
        if (await act(`/api/server/${action}`, { args })) load();
    };

    async function lock() {
        const v = await ask('Lock the server', [{ name: 'reason', label: 'Shown to anyone who tries to join', value: 'Maintenance, back soon' }], { confirm: 'Lock' });
        if (v) run('lock', [v.reason]);
    }

    async function restart() {
        const v = await ask('Schedule a restart', [
            { name: 'minutes', label: 'In how many minutes', type: 'number', value: '10' },
            { name: 'reason', label: 'Reason', placeholder: 'Shown to players' },
        ], { confirm: 'Schedule', text: 'Players get countdown warnings in game.' });
        if (v) run('restart', [Number(v.minutes), v.reason]);
    }

    async function announce() {
        const v = await ask('Announcement', [
            { name: 'title', label: 'Title', required: true },
            { name: 'text', label: 'Message', type: 'textarea', required: true },
        ], { confirm: 'Announce' });
        if (v) run('announce', [v.title, v.text]);
    }

    async function kickall() {
        const v = await ask('Kick everyone?', [{ name: 'reason', label: 'Reason', value: 'Server maintenance', required: true }], { confirm: 'Kick everyone', danger: true });
        if (v) run('kickall', [v.reason]);
    }
</script>

<div class="page-head"><h1>Server</h1></div>

{#if !has('fivecord')}
    <p class="notice">Locking and scheduled restarts need fivecord. Weather, time, announcements and kicking everyone work without it.</p>
{/if}

<div class="grid cards">
    {#if has('fivecord')}
        <div class="card">
            <h2>Joining</h2>
            {#if s?.lock?.on}
                <p><span class="badge amber">Locked</span> {s.lock.reason}</p>
                <p class="muted small">Only staff can join.</p>
                {#if can('server unlock')}<button class="btn" onclick={() => run('unlock')}>Unlock</button>{/if}
            {:else}
                <p><span class="badge green">Open</span></p>
                <p class="muted small">Locking keeps everyone but staff out, for maintenance.</p>
                {#if can('server lock')}<button class="btn" onclick={lock}>Lock</button>{/if}
            {/if}
        </div>

        <div class="card">
            <h2>Restart</h2>
            {#if s?.restart}
                <p>{s.restart.daily ? 'Daily restart' : 'Restart'} <strong>{ago(s.restart.at)}</strong></p>
                <p class="muted small">{date(s.restart.at)}{s.restart.reason ? ` · ${s.restart.reason}` : ''}{s.restart.by ? ` · by ${s.restart.by}` : ''}</p>
            {:else}
                <p class="muted">None planned.</p>
            {/if}
            <div class="row">
                {#if can('server restart')}<button class="btn" onclick={restart}>Schedule</button>{/if}
                {#if s?.restart && can('server cancelrestart')}<button class="btn" onclick={() => run('cancelRestart')}>Cancel it</button>{/if}
            </div>
        </div>
    {/if}

    {#if can('server weather')}
        <div class="card">
            <h2>Weather</h2>
            <div class="row">
                <select bind:value={weather}>
                    {#each s?.weatherTypes ?? [] as w}<option value={w}>{w.toLowerCase()}</option>{/each}
                </select>
                <button class="btn" onclick={() => run('weather', [weather])}>Set</button>
            </div>
        </div>
    {/if}

    {#if can('server time')}
        <div class="card">
            <h2>Time of day</h2>
            <div class="row">
                <input type="number" min="0" max="23" bind:value={hour} aria-label="Hour" />
                <span>:</span>
                <input type="number" min="0" max="59" bind:value={minute} aria-label="Minute" />
                <button class="btn" onclick={() => run('time', [hour, minute])}>Set</button>
            </div>
        </div>
    {/if}

    <div class="card">
        <h2>Everyone</h2>
        <div class="row">
            {#if can('announce')}<button class="btn" onclick={announce}>Announcement</button>{/if}
            {#if can('server kickall')}<button class="btn danger" onclick={kickall}>Kick everyone</button>{/if}
        </div>
    </div>
</div>

<style>
    .cards { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    p { margin: 0 0 10px; }
    select { width: auto; flex: 1; }
    input[type='number'] { width: 70px; }
    .notice { margin: 0 0 16px; }
</style>
