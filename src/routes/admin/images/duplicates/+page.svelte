<script>
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { buildCompareHref, createBrowserVisualDuplicateController } from '$lib/images/visual-duplicate-browser.js';
  import { createVisualDuplicateDismissals } from '$lib/images/visual-duplicate-dismissals.js';
  import { canonicalPairKey } from '$lib/images/visual-duplicate-matcher.js';

  /** @typedef {{ assetIdA: string, assetIdB: string, classification: 'likely' | 'possible', bestDistance: number, support: number, supportA: number, supportB: number, top3DistanceSum: number }} DiscoveredPair */
  /** @typedef {{ id: string, originalFilename: string | null, altText: string | null, imageUrl: string }} DiscoveryCandidateRecord */
  /** @typedef {{ data: { discoveryEnabled: boolean, scopes: { topics: { id: string, name: string }[], systems: { id: string, name: string }[] }, limits: { maxScanAssets: number, maxTotalFetchBytes: number, maxSingleFetchBytes: number, fetchConcurrency: number, decodeConcurrency: number } } }} PageData */
  /** @type {PageData} */
  let { data } = $props();

  let scope = $state('topic');
  let topicId = $state('');
  let systemId = $state('');
  let status = $state('idle');
  let errorMessage = $state('');
  let progress = $state(/** @type {any} */ (null));
  let candidateSet = $state(/** @type {any} */ (null));
  let scan = $state(/** @type {any} */ (null));
  let dismissedKeys = $state(/** @type {Set<string>} */ (new Set()));

  let controller = /** @type {any} */ (null);
  let dismissals = /** @type {any} */ (null);

  onMount(() => {
    topicId = data.scopes.topics[0]?.id ?? '';
    systemId = data.scopes.systems[0]?.id ?? '';
    dismissals = createVisualDuplicateDismissals(window.sessionStorage);
    dismissedKeys = new Set(dismissals.list());
    controller = createBrowserVisualDuplicateController({
      onProgress: (next) => { progress = next; }
    });
    return () => controller?.cancel();
  });

  /** @type {DiscoveredPair[]} */
  let allPairs = $derived(scan?.pairs ?? []);
  let visiblePairs = $derived(allPairs.filter((pair) => !dismissedKeys.has(canonicalPairKey(pair.assetIdA, pair.assetIdB))));
  let likelyPairs = $derived(visiblePairs.filter((pair) => pair.classification === 'likely'));
  let possiblePairs = $derived(visiblePairs.filter((pair) => pair.classification === 'possible'));
  let hiddenPairCount = $derived(allPairs.length - visiblePairs.length);
  /** @type {DiscoveryCandidateRecord[]} */
  let candidateRecords = $derived(candidateSet?.candidates ?? []);
  /** @type {Map<string, DiscoveryCandidateRecord>} */
  let candidateById = $derived(new Map(candidateRecords.map((candidate) => [candidate.id, candidate])));
  let busy = $derived(status === 'loading' || status === 'running');
  let progressPercent = $derived(progress && progress.phase === 'scan' && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0);

  /** @param {string} assetId */
  function labelFor(assetId) {
    return candidateById.get(assetId)?.originalFilename ?? assetId;
  }

  /** @param {string} assetId */
  function imageFor(assetId) {
    return candidateById.get(assetId)?.imageUrl ?? null;
  }

  /** @param {any} pair */
  function dismissPair(pair) {
    dismissals?.dismiss(pair.assetIdA, pair.assetIdB);
    dismissedKeys = new Set(dismissals?.list() ?? []);
  }

  function resetDismissed() {
    dismissals?.reset();
    dismissedKeys = new Set();
  }

  function cancelSearch() {
    controller?.cancel();
    status = 'idle';
    progress = null;
  }

  /** @param {any} payload */
  function emptyScan(payload) {
    return {
      pairs: [],
      failures: [],
      totalBytes: 0,
      comparisons: 0,
      truncated: Boolean(payload.truncated),
      budgetExceeded: false,
      aborted: false,
      candidateCount: payload.totalCount,
      scannedCount: 0,
      fingerprintedCount: 0,
      maxFetchConcurrency: 0,
      maxDecodeConcurrency: 0
    };
  }

  /** @param {'topic' | 'system' | 'global'} nextScope */
  async function startSearch(nextScope) {
    if (!browser || !controller) return;
    scope = nextScope;
    errorMessage = '';
    if (nextScope === 'topic' && !topicId) { status = 'error'; errorMessage = 'Choose a Primary Topic before starting a Topic search.'; return; }
    if (nextScope === 'system' && !systemId) { status = 'error'; errorMessage = 'Choose a System before widening to that System.'; return; }
    candidateSet = null;
    scan = null;
    progress = null;
    status = 'loading';

    const params = new URLSearchParams({ scope: nextScope });
    if (nextScope === 'topic') params.set('topic_id', topicId);
    if (nextScope === 'system') params.set('system_id', systemId);
    let payload = null;
    try {
      const response = await fetch(`/admin/images/duplicates/candidates?${params.toString()}`, { headers: { accept: 'application/json' } });
      payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to list discovery candidates.');
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unable to list discovery candidates.';
      return;
    }

    candidateSet = payload;
    if (!payload.candidates.length) {
      scan = emptyScan(payload);
      status = 'done';
      return;
    }
    status = 'running';
    let result;
    try {
      result = await controller.start({ candidates: payload.candidates, scope: payload });
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Visual duplicate discovery failed.';
      return;
    }
    if (!result.published) return;
    scan = result;
    status = 'done';
  }
</script>

<svelte:head><title>Find visual duplicates | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Read-only visual comparison</p>
    <h1>Find visual duplicates</h1>
    <p class="muted">Discovery compares bounded browser-side fingerprints and proposes review pairs only. It never merges, archives, or replaces an Asset. Similarity proposes review; it never proves identity, so every pair is certified separately in the existing comparison flow.</p>
  </div>
  <a class="button" href="/admin/images">Back to Images</a>
</section>

{#if !data.discoveryEnabled}
  <section class="panel"><p class="error" role="alert">Visual duplicate discovery requires an authenticated Production Administrator and the study database.</p></section>
{:else}
  <section class="panel" aria-labelledby="scope-heading">
    <h2 id="scope-heading">Scope</h2>
    <p class="muted">Topic scope is the default. Recursive-System and global searches are never widened automatically and must be started explicitly.</p>
    <div class="scope-grid">
      <article class="scope-card" class:active={scope === 'topic' && busy}>
        <h3>Topic</h3>
        <p class="muted">Active Production images with current learner-relevant usage in Cases whose canonical Primary Topic is exactly the selected Topic.</p>
        <label>Primary Topic
          <select bind:value={topicId} disabled={busy}>
            {#each data.scopes.topics as topic}<option value={topic.id}>{topic.name}</option>{/each}
          </select>
        </label>
        <button class="button primary" type="button" onclick={() => startSearch('topic')} disabled={busy || !data.scopes.topics.length}>Find likely duplicates in Topic</button>
      </article>
      <article class="scope-card" class:active={scope === 'system' && busy}>
        <h3>System — explicit widening</h3>
        <p class="muted">Adds images whose current Case usage has a Primary Topic anywhere below the selected System, at any depth.</p>
        <label>System
          <select bind:value={systemId} disabled={busy}>
            {#each data.scopes.systems as system}<option value={system.id}>{system.name}</option>{/each}
          </select>
        </label>
        <button class="button" type="button" onclick={() => startSearch('system')} disabled={busy || !data.scopes.systems.length}>Search this System</button>
      </article>
      <article class="scope-card" class:active={scope === 'global' && busy}>
        <h3>Global — explicit widening</h3>
        <p class="muted">Includes every eligible active Production image, including currently unused library Assets. This is the widest and slowest search.</p>
        <button class="button" type="button" onclick={() => startSearch('global')} disabled={busy}>Search global library</button>
      </article>
    </div>
  </section>

  {#if busy}
    <section class="panel" aria-live="polite">
      <h2>{status === 'loading' ? 'Listing candidates' : 'Comparing candidates'}</h2>
      {#if progress && progress.phase === 'scan'}
        <p class="muted" role="status">Fetched {progress.processed} of {progress.total} images · {progress.fingerprinted} fingerprinted · {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MiB used{progress.budgetExceeded ? ' · fetch budget reached' : ''}</p>
        <div class="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style={`width:${progressPercent}%`}></div></div>
      {:else if progress && progress.phase === 'compare'}
        <p class="muted" role="status">Scored {progress.comparisons} image pairs · {progress.discovered} proposed</p>
      {/if}
      <button class="button" type="button" onclick={cancelSearch}>Cancel search</button>
    </section>
  {/if}

  {#if status === 'error'}<section class="panel"><p class="error" role="alert">{errorMessage}</p></section>{/if}

  {#if scan}
    <section class="panel" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Discovery summary</h2>
      <p class="muted">Scope: {candidateSet?.scopeLabel ?? 'selected scope'} · {scan.scannedCount} of {scan.candidateCount} eligible images scanned · {scan.fingerprintedCount} fingerprinted · {(scan.totalBytes / (1024 * 1024)).toFixed(2)} MiB fetched · {scan.comparisons} pairs scored with {scan.maxFetchConcurrency} fetch / {scan.maxDecodeConcurrency} decode peak concurrency.</p>
      {#if scan.truncated}<p class="warning" role="alert">This scope matches {candidateSet?.totalCount ?? scan.candidateCount} eligible images but discovery compares at most {data.limits.maxScanAssets}. Results are bounded and incomplete; narrow the scope for a complete scan.</p>{/if}
      {#if scan.budgetExceeded}<p class="warning" role="alert">The {(data.limits.maxTotalFetchBytes / (1024 * 1024))} MiB fetch budget was reached before every candidate was compared. Results are incomplete; narrow the scope and search again.</p>{/if}
      {#if scan.aborted}<p class="warning" role="alert">This search was cancelled. No further results were published.</p>{/if}
      {#if scan.failures.length}
        <details class="failures">
          <summary>{scan.failures.length} image{scan.failures.length === 1 ? '' : 's'} skipped after a fetch, decode, or hash failure</summary>
          <ul>{#each scan.failures as failure}<li><strong>{labelFor(failure.assetId)}</strong> (Asset {failure.assetId}) · {failure.stage} failure · {failure.message}</li>{/each}</ul>
        </details>
      {/if}
      {#if scan.fingerprintedCount < 2 && !scan.failures.length && !scan.truncated}<p class="muted">Fewer than two comparable images were available, so no pair could be proposed.</p>{/if}
      {#if hiddenPairCount}<p class="muted">{hiddenPairCount} pair{hiddenPairCount === 1 ? '' : 's'} hidden by “Not duplicate” in this tab. <button class="link-button" type="button" onclick={resetDismissed}>Reset dismissed pairs</button></p>{/if}
    </section>

    {#if !visiblePairs.length && scan.fingerprintedCount >= 2}
      <section class="panel"><p class="muted">No pair met the review thresholds in this scope.{#if dismissedKeys.size} ({dismissedKeys.size} session-only dismissal{dismissedKeys.size === 1 ? '' : 's'} active; <button class="link-button" type="button" onclick={resetDismissed}>reset</button>.){/if}</p></section>
    {/if}

    {#if likelyPairs.length}
      <section aria-labelledby="likely-heading">
        <h2 id="likely-heading">Likely duplicates <span class="count">{likelyPairs.length}</span></h2>
        <p class="muted">Strongest matches, ranked by best distance, then top-3 distance sum, then support.</p>
        {#each likelyPairs as pair (canonicalPairKey(pair.assetIdA, pair.assetIdB))}
          <article class="pair-card likely">
            <div class="pair-head"><span class="pair-badge likely">Likely duplicate</span><span class="muted">{candidateSet?.scopeLabel} · best distance {pair.bestDistance} · top-3 sum {pair.top3DistanceSum} · support {pair.support}</span></div>
            <div class="pair-images">
              <figure><img src={imageFor(pair.assetIdA)} alt={candidateById.get(pair.assetIdA)?.altText ?? ''} loading="lazy" /><figcaption>{labelFor(pair.assetIdA)}<span class="muted">Asset {pair.assetIdA}</span></figcaption></figure>
              <figure><img src={imageFor(pair.assetIdB)} alt={candidateById.get(pair.assetIdB)?.altText ?? ''} loading="lazy" /><figcaption>{labelFor(pair.assetIdB)}<span class="muted">Asset {pair.assetIdB}</span></figcaption></figure>
            </div>
            <div class="pair-actions">
              <a class="button small primary" href={buildCompareHref(pair.assetIdA, pair.assetIdB)}>Compare — keep {labelFor(pair.assetIdA)} as survivor</a>
              <a class="button small" href={buildCompareHref(pair.assetIdB, pair.assetIdA)}>Compare — keep {labelFor(pair.assetIdB)} as survivor</a>
              <button class="button small" type="button" onclick={() => dismissPair(pair)}>Not duplicate</button>
            </div>
          </article>
        {/each}
      </section>
    {/if}

    {#if possiblePairs.length}
      <section aria-labelledby="possible-heading">
        <h2 id="possible-heading">Possible duplicates <span class="count">{possiblePairs.length}</span></h2>
        <p class="muted">Weaker matches that still merit a look. These are never presented as identical.</p>
        {#each possiblePairs as pair (canonicalPairKey(pair.assetIdA, pair.assetIdB))}
          <article class="pair-card possible">
            <div class="pair-head"><span class="pair-badge possible">Possible duplicate</span><span class="muted">{candidateSet?.scopeLabel} · best distance {pair.bestDistance} · top-3 sum {pair.top3DistanceSum} · support {pair.support}</span></div>
            <div class="pair-images">
              <figure><img src={imageFor(pair.assetIdA)} alt={candidateById.get(pair.assetIdA)?.altText ?? ''} loading="lazy" /><figcaption>{labelFor(pair.assetIdA)}<span class="muted">Asset {pair.assetIdA}</span></figcaption></figure>
              <figure><img src={imageFor(pair.assetIdB)} alt={candidateById.get(pair.assetIdB)?.altText ?? ''} loading="lazy" /><figcaption>{labelFor(pair.assetIdB)}<span class="muted">Asset {pair.assetIdB}</span></figcaption></figure>
            </div>
            <div class="pair-actions">
              <a class="button small primary" href={buildCompareHref(pair.assetIdA, pair.assetIdB)}>Compare — keep {labelFor(pair.assetIdA)} as survivor</a>
              <a class="button small" href={buildCompareHref(pair.assetIdB, pair.assetIdA)}>Compare — keep {labelFor(pair.assetIdB)} as survivor</a>
              <button class="button small" type="button" onclick={() => dismissPair(pair)}>Not duplicate</button>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  {/if}
{/if}

<style>
  .page-heading{display:grid;grid-template-columns:1fr auto;align-items:end;gap:1rem}.panel{margin:1rem 0;padding:1.1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}.eyebrow{margin:0 0 .3rem;color:#667085;font-size:.74rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.muted{color:#667085}.button{display:inline-block;padding:.7rem 1rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;color:#172033;text-decoration:none;cursor:pointer;font:inherit}.button.primary{border-color:#172033;background:#172033;color:#fff}.button.small{padding:.45rem .7rem}.button:disabled{cursor:not-allowed;opacity:.5}.link-button{padding:0;border:0;background:none;color:#175cd3;text-decoration:underline;cursor:pointer;font:inherit}.error{padding:.75rem;border-radius:8px;background:#fef3f2;color:#b42318}.warning{padding:.65rem .75rem;border-radius:8px;background:#fffaeb;color:#93370d}.scope-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:1rem;align-items:start}.scope-card{display:grid;grid-template-columns:minmax(0,1fr);gap:.6rem;padding:1rem;border:1px solid #eaecf0;border-radius:9px;align-content:start;min-width:0}.scope-card>*{min-width:0}.scope-card p{margin:0;overflow-wrap:break-word}.scope-card.active{border-color:#7da4e8;box-shadow:0 0 0 2px #e5efff}.scope-card h3{margin:0}.scope-card label{display:grid;gap:.3rem;font-weight:650;min-width:0}.scope-card select{width:100%;min-width:0;padding:.5rem;border:1px solid #cdd6e3;border-radius:8px;font:inherit}.scope-card .button{width:100%;text-align:center}.progress-track{height:.55rem;margin:.6rem 0;border-radius:999px;background:#eef2f6;overflow:hidden}.progress-fill{height:100%;background:#175cd3}.failures ul{padding-left:1.2rem}.count{color:#667085;font-weight:500}.pair-card{margin:1rem 0;padding:1rem;border:1px solid #eaecf0;border-radius:10px;background:#fff}.pair-card.likely{border-color:#f5c78b;box-shadow:0 0 0 2px #fff7e8}.pair-head{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}.pair-badge{padding:.2rem .5rem;border-radius:999px;font-size:.76rem;font-weight:750}.pair-badge.likely{background:#fff1d6;color:#93370d}.pair-badge.possible{background:#eef4ff;color:#175cd3}.pair-images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:.8rem 0}.pair-images figure{margin:0}.pair-images img{width:100%;height:240px;object-fit:contain;background:#eef2f6;border-radius:8px}.pair-images figcaption{display:grid;margin-top:.35rem;font-weight:650}.pair-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
</style>
