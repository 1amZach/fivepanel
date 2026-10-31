<script lang="ts">
    import Dialog from './lib/Dialog.svelte';
    import Toasts from './lib/Toasts.svelte';
    import { live, start, stop } from './lib/live.svelte';
    import { href, route } from './lib/router.svelte';
    import { can, has, loadMe, session } from './lib/session.svelte';
    import Anticheat from './pages/Anticheat.svelte';
    import Bans from './pages/Bans.svelte';
    import Console from './pages/Console.svelte';
    import Dashboard from './pages/Dashboard.svelte';
    import Login from './pages/Login.svelte';
    import Logs from './pages/Logs.svelte';
    import MapPage from './pages/Map.svelte';
    import Player from './pages/Player.svelte';
    import Players from './pages/Players.svelte';
    import Reports from './pages/Reports.svelte';
    import Resources from './pages/Resources.svelte';
    import Server from './pages/Server.svelte';

    loadMe();

    $effect(() => {
        if (session.me && session.me.access.tier >= 0) start();
        else stop();
    });

    const nav = $derived(
        [
            { page: 'dashboard', label: 'Dashboard', show: true },
            { page: 'players', label: 'Players', show: can('players') },
            { page: 'map', label: 'Live map', show: can('where') },
            { page: 'bans', label: 'Bans', show: can('bans') && (has('fivecord') || has('warden')) },
            { page: 'anticheat', label: 'Anticheat', show: can('bans') && has('warden') },
            { page: 'logs', label: 'Logs', show: can('logs') && has('fivelog') },
            { page: 'reports', label: 'Reports', show: can('players') && has('fivecord') },
            { page: 'console', label: 'Console', show: can('console') },
            { page: 'resources', label: 'Resources', show: can('resource list') },
            { page: 'server', label: 'Server', show: can('server status') },
        ].filter((n) => n.show),
    );

    let menuOpen = $state(false);
    $effect(() => {
        route.page;
        menuOpen = false;
    });
</script>

{#if session.loading}
    <div class="center muted">Loading…</div>
{:else if !session.me}
    <Login error={session.error} />
{:else}
    <div class="shell" class:open={menuOpen}>
        <aside>
            <a class="logo" href={href('dashboard')}>
                <img src="/favicon.svg" alt="" width="26" height="26" />
                <span>fivepanel</span>
            </a>
            <nav>
                {#each nav as n}
                    <a href={href(n.page)} class:active={route.page === n.page || (n.page === 'players' && route.page === 'player')}>{n.label}</a>
                {/each}
            </nav>
            <div class="foot">
                <div class="row small muted"><span class="dot" class:on={live.connected} class:off={!live.connected}></span>{live.connected ? 'Live' : 'Reconnecting…'}</div>
                <div class="row small faint">
                    {#if has('fivecord')}<span class="badge teal">fivecord</span>{/if}
                    {#if has('warden')}<span class="badge brand">warden</span>{/if}
                    {#if has('fivelog')}<span class="badge">fivelog</span>{/if}
                </div>
            </div>
        </aside>

        <div class="main">
            <header>
                <button class="btn ghost menu" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu">☰</button>
                <div class="server">
                    <strong>{live.stats?.hostname ?? 'Server'}</strong>
                    {#if live.stats}<span class="muted small">{live.stats.players} / {live.stats.maxPlayers} online</span>{/if}
                </div>
                <div class="me">
                    {#if session.me.staff.avatar}<img src={session.me.staff.avatar} alt="" width="28" height="28" />{/if}
                    <div>
                        <div>{session.me.staff.name}</div>
                        <div class="small muted">{session.me.access.tierName}</div>
                    </div>
                    <a class="btn small ghost" href="/auth/logout">Log out</a>
                </div>
            </header>

            <main>
                {#if route.page === 'dashboard'}<Dashboard />
                {:else if route.page === 'players'}<Players />
                {:else if route.page === 'player'}{#key route.args[0]}<Player ref={route.args[0] ?? ''} />{/key}
                {:else if route.page === 'map'}<MapPage />
                {:else if route.page === 'bans'}<Bans />
                {:else if route.page === 'anticheat'}<Anticheat />
                {:else if route.page === 'logs'}{#key route.args[0]}<Logs player={route.args[0] ?? ''} />{/key}
                {:else if route.page === 'reports'}<Reports />
                {:else if route.page === 'console'}<Console />
                {:else if route.page === 'resources'}<Resources />
                {:else if route.page === 'server'}<Server />
                {:else}<div class="empty">Nothing here. <a href={href('dashboard')}>Back to the dashboard</a></div>
                {/if}
            </main>
        </div>
    </div>
{/if}

<Dialog />
<Toasts />

<style>
    .center { display: grid; place-items: center; min-height: 100vh; }
    .shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
    aside {
        position: sticky;
        top: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 18px 12px;
        border-right: 1px solid var(--line);
        background: #100e20;
    }
    .logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; padding: 0 8px; }
    nav { display: flex; flex-direction: column; gap: 2px; }
    nav a { padding: 8px 10px; border-radius: 8px; color: var(--muted); }
    nav a:hover { background: var(--panel-2); color: var(--text); }
    nav a.active { background: var(--brand-soft); color: #fff; box-shadow: inset 2px 0 0 var(--brand); }
    .foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
    .main { min-width: 0; display: flex; flex-direction: column; }
    header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 24px;
        border-bottom: 1px solid var(--line);
        background: rgb(13 11 26 / 0.85);
        backdrop-filter: blur(8px);
        position: sticky;
        top: 0;
        z-index: 5;
    }
    .server { display: flex; flex-direction: column; min-width: 0; }
    .server strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .me { margin-left: auto; display: flex; align-items: center; gap: 10px; }
    .me img { border-radius: 50%; }
    main { padding: 24px; max-width: 1400px; width: 100%; }
    .menu { display: none; }

    @media (max-width: 860px) {
        .shell { grid-template-columns: 1fr; }
        aside { position: fixed; z-index: 20; width: 240px; transform: translateX(-100%); transition: transform 0.18s; }
        .shell.open aside { transform: none; }
        .menu { display: inline-flex; }
        header { padding: 10px 16px; }
        main { padding: 16px; }
        .me div { display: none; }
    }
</style>
