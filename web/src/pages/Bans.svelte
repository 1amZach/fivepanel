<script lang="ts">
    import { act, api } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { date } from '../lib/format';
    import { go } from '../lib/router.svelte';
    import { can } from '../lib/session.svelte';

    let active = $state(true);
    let q = $state('');
    let data = $state<{ source: string; bans: any[] } | null>(null);
    let error = $state('');

    async function load() {
        try {
            data = await api(`/api/bans?active=${active ? 1 : 0}&q=${encodeURIComponent(q.trim())}`);
            error = '';
        } catch (e) {
            error = (e as Error).message;
        }
    }

    let timer: ReturnType<typeof setTimeout>;
    $effect(() => {
        active;
        q;
        clearTimeout(timer);
        timer = setTimeout(load, 250);
    });

    async function unban(b: any) {
        const v = await ask(`Lift ban #${b.id} on ${b.name}?`, data?.source === 'fivecord' ? [{ name: 'reason', label: 'Why', placeholder: 'Appeal accepted' }] : [], {
            confirm: 'Lift ban',
        });
        if (v && (await act(`/api/bans/${b.id}/unban`, { reason: v.reason ?? '', source: data?.source }))) load();
    }

    const open = (b: any) => b.license && go('player', `#${b.license.replace(/^license:/, '')}`);
</script>

<div class="page-head">
    <h1>Bans {#if data}<span class="muted">{data.bans.length}</span>{/if}</h1>
    <div class="row">
        <div class="toggle">
            <button class:on={active} onclick={() => (active = true)}>Active</button>
            <button class:on={!active} onclick={() => (active = false)}>All</button>
        </div>
        <input class="search" placeholder="Search name or reason" bind:value={q} />
    </div>
</div>

{#if error}<div class="notice">{error}</div>{/if}
{#if data?.source === 'warden'}<p class="muted small">Showing warden's own bans. Run fivecord to see every ban with history.</p>{/if}

<div class="card table-wrap">
    <table>
        <thead><tr><th>#</th><th>Player</th><th>Reason</th><th class="wide">By</th><th class="wide">Banned</th><th>Ends</th><th></th></tr></thead>
        <tbody>
            {#each data?.bans ?? [] as b (b.id)}
                <tr class:link={Boolean(b.license)} onclick={() => open(b)}>
                    <td class="mono faint">{b.id}</td>
                    <td><strong>{b.name}</strong></td>
                    <td>{b.reason}{#if b.detail}<div class="small faint">{b.detail}</div>{/if}</td>
                    <td class="muted wide">{b.staff}</td>
                    <td class="muted small wide">{date(b.created)}</td>
                    <td class="small">
                        {#if b.revokedBy}<span class="badge">lifted by {b.revokedBy}</span>
                        {:else if !b.active}<span class="badge">expired</span>
                        {:else if b.expires}{date(b.expires)}
                        {:else}<span class="badge red">never</span>{/if}
                    </td>
                    <td class="right">
                        {#if b.active && can('unban')}
                            <button class="btn small" onclick={(e) => (e.stopPropagation(), unban(b))}>Lift</button>
                        {/if}
                    </td>
                </tr>
            {:else}
                <tr><td colspan="7" class="empty">{data ? 'No bans.' : 'Loading…'}</td></tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .search { width: 260px; }
    .right { text-align: right; }
    .toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .toggle button { background: none; border: 0; padding: 7px 12px; cursor: pointer; color: var(--muted); }
    .toggle button.on { background: var(--brand-soft); color: #fff; }
</style>
