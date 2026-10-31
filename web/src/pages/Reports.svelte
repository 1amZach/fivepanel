<script lang="ts">
    import { onMount } from 'svelte';
    import { act, api } from '../lib/api';
    import { ask } from '../lib/dialog.svelte';
    import { ago, clock } from '../lib/format';
    import { go } from '../lib/router.svelte';

    let reports = $state<any[]>([]);
    let openId = $state<number | null>(null);
    let text = $state('');
    let error = $state('');

    async function load() {
        try {
            reports = await api('/api/reports');
            if (openId == null || !reports.some((r) => r.id === openId)) openId = reports[0]?.id ?? null;
            error = '';
        } catch (e) {
            error = (e as Error).message;
        }
    }

    onMount(() => {
        load();
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    });

    const current = $derived(reports.find((r) => r.id === openId));

    async function reply(e: SubmitEvent) {
        e.preventDefault();
        if (!current || !text.trim()) return;
        if (await act(`/api/reports/${current.id}/reply`, { text })) {
            text = '';
            load();
        }
    }

    async function close() {
        const v = await ask(`Close report #${current.id}?`, [{ name: 'note', label: 'Last message to the player', placeholder: 'Optional' }], { confirm: 'Close' });
        if (v && (await act(`/api/reports/${current.id}/close`, { text: v.note }))) load();
    }
</script>

<div class="page-head"><h1>Reports <span class="muted">{reports.length}</span></h1></div>

{#if error}
    <div class="notice">{error}</div>
{:else if !reports.length}
    <div class="notice">No open reports. Players open one with /report in game.</div>
{:else}
    <div class="layout">
        <div class="card list side">
            {#each reports as r (r.id)}
                <button class="pick" class:active={r.id === openId} onclick={() => (openId = r.id)}>
                    <div class="spread"><strong>#{r.id} · {r.name}</strong><span class="faint small">{ago(r.opened)}</span></div>
                    <div class="small muted clip">{r.messages[0]?.text}</div>
                    <div class="row small">
                        {#if r.claimedBy}<span class="badge teal">{r.claimedBy}</span>{:else}<span class="badge amber">unclaimed</span>{/if}
                        {#if !r.online}<span class="badge">left</span>{/if}
                    </div>
                </button>
            {/each}
        </div>

        {#if current}
            <div class="card chat">
                <div class="spread">
                    <h2>#{current.id} · {current.name} <span class="faint">({current.src})</span></h2>
                    <div class="row">
                        <button class="btn small" onclick={() => go('player', `@${current.src}`)}>Profile</button>
                        {#if !current.claimedBy}<button class="btn small" onclick={async () => (await act(`/api/reports/${current.id}/claim`)) && load()}>Claim</button>{/if}
                        <button class="btn small danger" onclick={close}>Close</button>
                    </div>
                </div>
                <div class="messages">
                    {#each current.messages as m}
                        <div class="msg" class:staff={m.staff}>
                            <div class="small muted">{m.from} · {clock(m.at)}</div>
                            <div>{m.text}</div>
                        </div>
                    {/each}
                </div>
                <form class="row" onsubmit={reply}>
                    <input placeholder={current.online ? 'Reply, it shows in their chat' : 'They left the server'} bind:value={text} disabled={!current.online} />
                    <button class="btn primary" disabled={!current.online || !text.trim()}>Send</button>
                </form>
            </div>
        {/if}
    </div>
{/if}

<style>
    .layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
    .side { padding: 6px; max-height: calc(100vh - 180px); overflow: auto; }
    .pick { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; background: none; border: 0; padding: 10px; border-radius: 8px; cursor: pointer; }
    .pick:hover, .pick.active { background: var(--panel-2); }
    .clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat { display: flex; flex-direction: column; gap: 12px; min-height: 420px; }
    .messages { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: auto; max-height: calc(100vh - 320px); }
    .msg { max-width: 75%; padding: 8px 12px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); align-self: flex-start; }
    .msg.staff { align-self: flex-end; background: var(--brand-soft); border-color: rgb(156 44 241 / 0.4); }
    form input { flex: 1; width: auto; }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
</style>
