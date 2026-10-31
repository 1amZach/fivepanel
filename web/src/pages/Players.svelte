<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '../lib/api';
    import { ago, duration } from '../lib/format';
    import { live } from '../lib/live.svelte';
    import { go } from '../lib/router.svelte';
    import { can, has } from '../lib/session.svelte';

    let players = $state<any[]>([]);
    let q = $state('');
    let offline = $state<any[]>([]);
    let searching = $state(false);

    async function load() {
        players = await api('/api/players').catch(() => players);
    }

    onMount(() => {
        load();
        const t = setInterval(load, 10_000);
        return () => clearInterval(t);
    });

    // live pings while the full list refreshes less often
    const pings = $derived(new Map(live.players.map((p) => [p.src, p.ping])));
    const shown = $derived(
        players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || String(p.src) === q.trim()),
    );

    let timer: ReturnType<typeof setTimeout>;
    $effect(() => {
        const term = q.trim();
        clearTimeout(timer);
        offline = [];
        if (term.length < 2 || !has('fivecord') || !can('lookup')) return;
        timer = setTimeout(async () => {
            searching = true;
            offline = (await api(`/api/search?q=${encodeURIComponent(term)}`).catch(() => [])).filter((p: any) => !p.online);
            searching = false;
        }, 300);
    });

    const now = () => Date.now() / 1000;
</script>

<div class="page-head">
    <h1>Players <span class="muted">{players.length}</span></h1>
    <input class="search" placeholder={has('fivecord') ? 'Search by name or id, online or not' : 'Search by name or id'} bind:value={q} />
</div>

<div class="card table-wrap">
    <table>
        <thead>
            <tr><th>ID</th><th>Name</th><th class="wide">Discord</th><th>Playing for</th><th class="wide">Ping</th><th class="wide"></th></tr>
        </thead>
        <tbody>
            {#each shown as p (p.src)}
                <tr class="link" onclick={() => go('player', `@${p.src}`)}>
                    <td class="mono">{p.src}</td>
                    <td><strong>{p.name}</strong> {#if p.staff}<span class="badge brand">{p.staff}</span>{/if} {#if p.frozen}<span class="badge teal">frozen</span>{/if}</td>
                    <td class="mono faint wide">{p.discord ?? '–'}</td>
                    <td class="muted">{p.joined ? duration(now() - p.joined) : '–'}</td>
                    <td class="mono wide">{pings.get(p.src) ?? p.ping}ms</td>
                    <td class="right wide"><span class="faint">›</span></td>
                </tr>
            {:else}
                <tr><td colspan="6" class="empty">{q ? 'Nobody online matches that.' : 'Nobody is online.'}</td></tr>
            {/each}
        </tbody>
    </table>
</div>

{#if offline.length || searching}
    <div class="card table-wrap offline">
        <h2>Offline {#if searching}<span class="faint small">searching…</span>{/if}</h2>
        <table>
            <tbody>
                {#each offline as p (p.license)}
                    <tr class="link" onclick={() => go('player', `#${p.license.replace(/^license:/, '')}`)}>
                        <td><strong>{p.name}</strong></td>
                        <td class="muted">last seen {ago(p.lastSeen)}</td>
                        <td class="right"><span class="faint">›</span></td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}

<style>
    .search { max-width: 340px; }
    .right { text-align: right; }
    .offline { margin-top: 16px; }
</style>
