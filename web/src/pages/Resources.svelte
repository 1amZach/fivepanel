<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { can } from '../lib/session.svelte';

    let list = $state<any[]>([]);
    let q = $state('');
    let only = $state('');
    let busy = $state<string | null>(null);

    const load = async () => (list = await api('/api/resources').catch(() => list));
    onMount(load);

    const shown = $derived(list.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!only || r.state === only)));
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

    const color = (s: string) => (s === 'started' ? 'green' : s === 'stopped' ? '' : 'amber');
</script>

<div class="page-head">
    <h1>Resources <span class="muted">{running} running of {list.length}</span></h1>
    <div class="row">
        <select bind:value={only}>
            <option value="">All</option>
            <option value="started">Running</option>
            <option value="stopped">Stopped</option>
        </select>
        <input class="search" placeholder="Search" bind:value={q} />
        {#if can('resource refresh')}<button class="btn" onclick={async () => (await act('/api/resources/refresh'), load())}>Refresh list</button>{/if}
    </div>
</div>

<div class="card table-wrap">
    <table>
        <thead><tr><th>Name</th><th>State</th><th class="wide">Version</th><th class="wide">Author</th><th></th></tr></thead>
        <tbody>
            {#each shown as r (r.name)}
                <tr>
                    <td><strong class="mono">{r.name}</strong>{#if r.description}<div class="small faint">{r.description}</div>{/if}</td>
                    <td><span class="badge {color(r.state)}">{r.state}</span></td>
                    <td class="muted small wide">{r.version ?? ''}</td>
                    <td class="muted small wide">{r.author ?? ''}</td>
                    <td class="right row">
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

<style>
    select { width: auto; }
    .search { width: 220px; }
    .right { justify-content: flex-end; flex-wrap: nowrap; }
</style>
