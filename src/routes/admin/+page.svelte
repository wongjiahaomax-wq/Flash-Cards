<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Admin | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Administrator: {data.user.email}</p>
      <h1>Admin</h1>
      <p>
        This area is restricted to the Better Auth admin role. V1 content-management
        and learner-progress forms will be added after the seeded study flow is working.
      </p>
    </div>

    <div class="actions">
      <a class="button" href="/study">Study</a>
      <a class="button" href="/">Home</a>
      <SignOutButton />
    </div>
  </section>

  <section class="card stack" aria-labelledby="upload-heading">
    <div>
      <p class="eyebrow">Asset pipeline</p>
      <h2 id="upload-heading">Upload teaching image</h2>
      <p class="muted">JPEG and PNG only, up to 5 MiB per image. Source details are optional.</p>
    </div>

    {#if form?.error}
      <p class="form-error" role="alert">{form.error}</p>
    {/if}

    <form method="POST" action="?/upload" enctype="multipart/form-data" class="stack">
      <label>
        Image
        <input name="image" type="file" accept="image/jpeg,image/png" required />
      </label>
      <label>
        Alt text
        <input name="alt_text" type="text" maxlength="500" required />
      </label>
      <label>
        Source label <span class="muted">(optional)</span>
        <input name="source_label" type="text" maxlength="300" />
      </label>
      <label>
        Source URL <span class="muted">(optional reference only)</span>
        <input name="source_url" type="url" maxlength="2000" />
      </label>
      <label>
        Licence / permission <span class="muted">(optional)</span>
        <input name="licence" type="text" maxlength="500" />
      </label>
      <button class="button primary" type="submit">Upload image</button>
    </form>
  </section>

  <section class="card stack" aria-labelledby="assets-heading">
    <div>
      <p class="eyebrow">Stored assets</p>
      <h2 id="assets-heading">Teaching images</h2>
    </div>

    {#if data.assets.length === 0}
      <p class="muted">No teaching images have been uploaded yet.</p>
    {:else}
      <div class="asset-list">
        {#each data.assets as asset}
          <article class="asset-row">
            <img src={asset.imageUrl} alt={asset.altText ?? ''} width="120" height="90" />
            <div class="stack asset-details">
              <strong>{asset.originalFilename ?? asset.id}</strong>
              <span>{asset.mimeType} · {asset.isActive ? 'Active' : 'Inactive'}</span>
              {#if asset.sourceLabel}<span>Source: {asset.sourceLabel}</span>{/if}
              {#if asset.sourceUrl}<a href={asset.sourceUrl} target="_blank" rel="noreferrer">Reference source</a>{/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  h2 { margin: 0.15rem 0 0; }
  .eyebrow { margin: 0; color: #667085; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 600; }
  input { width: 100%; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0.65rem 0.75rem; font: inherit; }
  .form-error { margin: 0; padding: 0.75rem; color: #b42318; background: #fef3f2; border-radius: 8px; }
  .asset-list { display: grid; gap: 0.75rem; }
  .asset-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem; border: 1px solid #eaecf0; border-radius: 10px; }
  .asset-row img { width: 120px; height: 90px; object-fit: contain; background: #f2f4f7; border-radius: 6px; }
  .asset-details { gap: 0.2rem; font-size: 0.88rem; }
</style>
