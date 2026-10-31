<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api, enc } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { ago } from '../lib/format';
    import { can, has } from '../lib/session.svelte';
    import UpdateDialog from '../lib/UpdateDialog.svelte';

    interface Tracked {
        name: string;
        version: string;
        latest: string | null;
        url: string | null;
        error: string | null;
        last: { from: string; to: string; time: number; state: string } | null;
    }

    let list = $state<any[]>([]);
    let tracked = $state<Record<string, Tracked>>({});
    let checked = $state(0);
    let checking = $state(false);
    let q = $state('');
    let only = $state('');
    let busy = $state<string | null>(null);
    let updating = $state<string | null>(null);

    const load = async () => (list = await api('/api/resources').catch(() => list));

    function took(r: { checked: number; resources: Tracked[] }) {
        checked = r.checked;
        tracked = Object.fromEntries(r.resources.map((t) => [t.name, t]));
    }
    const loadUpdates = async () => {
        if (has('fiveupdate')) await api('/api/updates').then(took).catch(() => {});
    };

    onMount(() => {
        load();
        loadUpdates();
    });

    // fiveupdate compares versions properly; here it's only which side is newer
    const newer = (t?: Tracked) => !!t?.latest && t.latest !== t.version && !t.error;
    const updates = $derived(list.filter((r) => newer(tracked[r.name])));

    const shown = $derived(
        list.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!only || (only === 'updates' ? newer(tracked[r.name]) : r.state === only))),
    );
    const running = $derived(list.filter((r) => r.state === 'started').length);

    async function run(name: string, action: string) {
        if (action === 'stop') {
            const v = await ask(`Stop ${name}?`, [], { confirm: 'Stop', danger: true, text: 'Anything that depends on it may break until it starts again.' });
            if (!v) return;
        }
        busy = name;
        await act(`/api/resources/${encodeURIComponent(name)}/${action}`);
        setTimeout(async () => ((busy = null), await load()), 800);
    }

    async function check() {
        checking = true;
        await api('/api/updates/check', 'POST').then(took).catch(() => {});
        checking = false;
    }

    async function undo(name: string, t: Tracked) {
        const v = await ask(`Undo the update of ${name}?`, [], {
            confirm: 'Undo',
            danger: true,
            text: `Puts back the files of ${t.last!.from} that the update to ${t.last!.to} replaced. Files changed since the update are left alone.`,
        });
        if (!v) return;
        busy = name;
        await act(`/api/updates/${enc(name)}/undo`);
        busy = null;
        await Promise.all([load(), loadUpdates()]);
    }

    async function closed(changed: boolean) {
        updating = null;
        if (changed) await Promise.all([load(), loadUpdates()]);
    }

    const color = (s: string) => (s === 'started' ? 'green' : s === 'stopped' ? '' : 'amber');
    const undoable = (r: any, t?: Tracked) => t?.last?.state === 'done' && t.last.to === r.version;
</script>

<div class="page-head">
    <h1>Resources <span class="muted">{running} running of {list.length}</span></h1>
    <div class="row">
        <select bind:value={only}>
            <option value="">All</option>
            <option value="started">Running</option>
            <option value="stopped">Stopped</option>
            {#if has('fiveupdate')}<option value="updates">Updates</option>{/if}
        </select>
        <input class="search" placeholder="Search" bind:value={q} />
        {#if can('resource refresh')}<button class="btn" onclick={async () => (await act('/api/resources/refresh'), load())}>Refresh list</button>{/if}
    </div>
</div>

{#if has('fiveupdate')}
    <div class="card bar" class:has={updates.length}>
        <div>
            {#if updates.length}
                <strong>{updates.length} update{updates.length === 1 ? '' : 's'} available</strong>
                <span class="muted small">{updates.map((r) => r.name).join(', ')}</span>
            {:else}
                <strong>Everything is up to date</strong>
                <span class="muted small">{Object.keys(tracked).length} resources are checked against their GitHub releases</span>
            {/if}
        </div>
        <div class="row">
            {#if checked}<span class="faint small">Checked {ago(checked)}</span>{/if}
            {#if can('resource update')}<button class="btn small" onclick={check} disabled={checking}>{checking ? 'Checking…' : 'Check now'}</button>{/if}
        </div>
    </div>
{/if}

<div class="card table-wrap">
    <table>
        <thead><tr><th>Name</th><th>State</th><th class="wide">Version</th><th class="wide">Author</th><th></th></tr></thead>
        <tbody>
            {#each shown as r (r.name)}
                {@const t = tracked[r.name]}
                <tr>
                    <td><strong class="mono">{r.name}</strong>{#if newer(t)}<span class="badge amber narrow">{t!.latest} out</span>{/if}{#if r.description}<div class="small faint">{r.description}</div>{/if}</td>
                    <td><span class="badge {color(r.state)}">{r.state}</span></td>
                    <td class="muted small wide">
                        <div class="ver">
                            {r.version ?? ''}
                            {#if newer(t)}<a class="badge amber" href={t!.url} target="_blank" rel="noreferrer" title="Release notes">{t!.latest} out</a>{/if}
                        </div>
                    </td>
                    <td class="muted small wide">{r.author ?? ''}</td>
                    <td class="right row">
                        {#if newer(t) && can('resource update')}<button class="btn small primary" disabled={busy === r.name} onclick={() => (updating = r.name)}>Update</button>{/if}
                        {#if undoable(r, t) && can('resource update')}<button class="btn small ghost" disabled={busy === r.name} onclick={() => undo(r.name, t!)} title="Put back {t!.last!.from}">Undo update</button>{/if}
                        {#if r.state === 'started'}
                            {#if can('resource restart')}<button class="btn small" disabled={busy === r.name} onclick={() => run(r.name, 'restart')}>Restart</button>{/if}
                            {#if can('resource stop') && r.name !== 'fivepanel'}<button class="btn small danger" disabled={busy === r.name} onclick={() => run(r.name, 'stop')}>Stop</button>{/if}
                        {:else if can('resource start')}
                            <button class="btn small" disabled={busy === r.name} onclick={() => run(r.name, 'start')}>Start</button>
                        {/if}
                    </td>
                </tr>
            {:else}
                <tr><td colspan="5" class="empty">Nothing matches.</td></tr>
            {/each}
        </tbody>
    </table>
</div>

{#if updating}
    <UpdateDialog name={updating} running={list.find((r) => r.name === updating)?.state === 'started'} onclose={closed} />
{/if}

<style>
    select { width: auto; }
    .search { width: 220px; }
    .right { justify-content: flex-end; flex-wrap: nowrap; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; padding: 12px 16px; }
    .bar > div:first-child { display: flex; flex-direction: column; gap: 2px; }
    .bar.has { border-color: rgb(245 165 36 / 0.35); }
    .bar.has strong { color: var(--amber); }
    .ver { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ver a { text-decoration: none; }
    .narrow { display: none; margin-left: 8px; }
    @media (max-width: 860px) { .narrow { display: inline-flex; } }
</style>
