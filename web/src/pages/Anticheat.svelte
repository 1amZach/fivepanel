<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { ago, date, labels } from '../lib/format';
    import { listen } from '../lib/live.svelte';
    import { go } from '../lib/router.svelte';
    import { can, has } from '../lib/session.svelte';

    let items = $state<any[]>([]);
    let kind = $state('');
    let action = $state('');
    let showDismissed = $state(false);
    let image = $state<{ id: number; src: string } | null>(null);

    onMount(() => {
        api('/api/detections').then((d) => (items = d)).catch(() => {});
        return listen('detection', (d) => (items = [d, ...items].slice(0, 300)));
    });

    const kinds = $derived([...new Set(items.map((d) => d.kind))].sort());
    const shown = $derived(
        items.filter((d) => (!kind || d.kind === kind) && (!action || d.action === action) && (showDismissed || !d.dismissed)),
    );

    async function view(d: any) {
        const r = await api(`/api/detections/${d.id}/image`).catch(() => null);
        if (r) image = { id: d.id, src: r.image };
    }

    async function dismiss(d: any) {
        if (await act(`/api/detections/${d.id}/dismiss`)) d.dismissed = true;
    }

    // ban from the feed: online players by id, gone ones by license
    async function ban(d: any) {
        const ref = d.license ? `#${d.license.replace(/^license:/, '')}` : `@${d.src}`;
        const v = await ask(`Ban ${d.name}`, [
            { name: 'length', label: 'Length', type: 'select', options: [{ value: 'perm', label: 'Permanent' }, { value: '30d', label: '30 days' }, { value: '1w', label: '1 week' }, { value: '3d', label: '3 days' }] },
            { name: 'reason', label: 'Reason', value: `Cheating: ${labels[d.kind] ?? d.kind}`, required: true },
        ], { confirm: 'Ban', danger: true });
        if (v) await act(`/api/player/${encodeURIComponent(ref)}/ban`, { args: [v.length, v.reason] });
    }

    const color = (a: string) => (a === 'ban' ? 'red' : a === 'kick' ? 'amber' : '');
</script>

<div class="page-head">
    <h1>Anticheat</h1>
    <div class="row">
        <select bind:value={kind}>
            <option value="">Every check</option>
            {#each kinds as k}<option value={k}>{labels[k] ?? k}</option>{/each}
        </select>
        <select bind:value={action}>
            <option value="">Any result</option>
            <option value="log">Logged</option>
            <option value="kick">Kicked</option>
            <option value="ban">Banned</option>
        </select>
        <label class="row small muted"><input type="checkbox" bind:checked={showDismissed} /> Dismissed</label>
    </div>
</div>

<p class="muted small">Live from warden since the panel started. Kicks and bans come with a screenshot when screenshot-basic is running.</p>

<div class="card table-wrap">
    <table>
        <thead><tr><th>When</th><th>Player</th><th>Check</th><th>Detail</th><th>Result</th><th></th></tr></thead>
        <tbody>
            {#each shown as d (d.id)}
                <tr class:dim={d.dismissed}>
                    <td class="small muted" title={date(d.at)}>{ago(d.at)}</td>
                    <td><strong>{d.name}</strong> <span class="faint">({d.src})</span></td>
                    <td>{labels[d.kind] ?? d.kind}</td>
                    <td class="small muted">{d.detail ?? ''}</td>
                    <td><span class="badge {color(d.action)}">{d.action}</span></td>
                    <td class="right row">
                        {#if d.hasImage}<button class="btn small" onclick={() => view(d)}>Screenshot</button>{/if}
                        {#if d.action !== 'ban' && has('fivecord') && can('ban')}<button class="btn small danger" onclick={() => ban(d)}>Ban</button>{/if}
                        {#if d.action === 'log' && !d.dismissed}<button class="btn small ghost" onclick={() => dismiss(d)}>Dismiss</button>{/if}
                        {#if d.action === 'log'}<button class="btn small ghost" onclick={() => go('player', `@${d.src}`)}>Profile</button>{/if}
                    </td>
                </tr>
            {:else}
                <tr><td colspan="6" class="empty">Nothing detected since the panel started.</td></tr>
            {/each}
        </tbody>
    </table>
</div>

{#if image}
    <div class="backdrop" role="presentation" onclick={() => (image = null)}>
        <img src={image.src} alt="Screenshot" />
    </div>
{/if}

<style>
    select { width: auto; }
    label input { width: auto; }
    .right { justify-content: flex-end; flex-wrap: nowrap; }
    tr.dim td { opacity: 0.45; }
    .backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(5 4 12 / 0.85); display: grid; place-items: center; padding: 24px; cursor: zoom-out; }
    .backdrop img { max-width: 100%; max-height: 100%; border-radius: 10px; }
</style>
