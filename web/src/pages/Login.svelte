<script lang="ts">
    let { error = null }: { error?: string | null } = $props();
    const failed = new URLSearchParams(location.search).get('error') === 'login';
</script>

<div class="wrap">
    <div class="card box">
        <img src="/favicon.svg" alt="" width="44" height="44" />
        <h1>fivepanel</h1>
        {#if error}
            <p class="err">{error}</p>
            <a class="btn" href="/auth/logout">Use another account</a>
        {:else}
            <p class="muted">Staff log in with Discord.</p>
            {#if failed}<p class="err">That login didn't go through. Try again.</p>{/if}
            <a class="btn primary big" href="/auth/login">Log in with Discord</a>
        {/if}
    </div>
    <p class="faint small">Made by IamZach · <a href="https://discord.gg/agn" target="_blank" rel="noreferrer">discord.gg/agn</a></p>
</div>

<style>
    .wrap {
        min-height: 100vh;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 14px;
        padding: 16px;
        background: radial-gradient(800px 400px at 50% 30%, rgb(156 44 241 / 0.14), transparent 70%);
    }
    .box { width: min(360px, 100%); display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 30px 26px; }
    p { margin: 0; }
    .err { color: #ff8d90; }
    .big { width: 100%; padding: 10px; margin-top: 6px; }
    a:not(.btn) { text-decoration: underline; }
</style>
