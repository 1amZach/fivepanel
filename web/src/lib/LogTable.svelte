<script lang="ts">
    import { clock, date, logKinds, playerRef } from './format';
    import { href } from './router.svelte';

    let { rows, empty = 'Nothing logged.' }: { rows: any[]; empty?: string } = $props();

    const day = (t: number) => new Date(t * 1000).toDateString();
</script>

<div class="table-wrap">
    <table>
        <thead><tr><th>When</th><th class="kind">Kind</th><th>What happened</th><th class="wide">Who</th></tr></thead>
        <tbody>
            {#each rows as r, i (r.id ?? `${r.at}-${i}`)}
                {#if i === 0 || day(rows[i - 1].at) !== day(r.at)}
                    <tr class="day"><td colspan="4">{new Date(r.at * 1000).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</td></tr>
                {/if}
                <tr>
                    <td class="small muted mono time" title={date(r.at)}>{clock(r.at)}</td>
                    <td class="kind"><span class="badge {logKinds[r.kind]?.color ?? ''}">{logKinds[r.kind]?.label ?? r.kind}</span></td>
                    <td class="text" title={r.x != null ? `${r.x}, ${r.y}, ${r.z}` : undefined}>
                        <span class="kdot {logKinds[r.kind]?.color ?? ''}"></span>{r.text}
                    </td>
                    <td class="small wide who">
                        {#if r.license}<a href={href('player', playerRef(r.license))}>{r.name}</a>{/if}
                        {#if r.target}<span class="faint arrow">→</span><a href={href('player', playerRef(r.target))}>{r.targetName}</a>{/if}
                    </td>
                </tr>
            {:else}
                <tr><td colspan="4" class="empty">{empty}</td></tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .text { word-break: break-word; }
    .time { white-space: nowrap; }
    .kdot { display: none; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: middle; background: var(--faint); }
    .kdot.red { background: #ff8d90; }
    .kdot.amber { background: var(--amber); }
    .kdot.green { background: var(--green); }
    .kdot.brand { background: #c99bff; }
    .kdot.teal { background: var(--teal); }
    .who { white-space: nowrap; }
    .who a:hover { text-decoration: underline; }
    .arrow { margin: 0 6px; }
    tr.day td { font-size: 12px; color: var(--faint); padding-top: 14px; border-bottom: none; }
    @media (max-width: 860px) {
        .wide, .kind { display: none; }
        .kdot { display: inline-block; }
    }
</style>
