<script>
  let { data, form } = $props();

  const statusMessages = {
    demoted: 'Account changed to Learner.',
    'demoted-preview-retained': 'Production Administrator access removed. Preview Admin access was retained.'
  };

  function pageHref(page) {
    const params = new URLSearchParams();
    if (data.search) params.set('q', data.search);
    if (data.searchField) params.set('field', data.searchField);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `/admin/accounts?${query}` : '/admin/accounts';
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>Accounts | Flash-Cards Admin</title>
</svelte:head>

<div class="stack">
  <div class="page-heading">
    <div>
      <p class="eyebrow">Production Admin</p>
      <h1>Accounts</h1>
      <p class="muted">Create and manage Learner and Production Administrator accounts.</p>
    </div>
  </div>

  {#if data.status && statusMessages[data.status]}
    <p class="notice success" role="status">{statusMessages[data.status]}</p>
  {/if}

  <details class="card stack" open={Boolean(form?.error)}>
    <summary><strong>Add account</strong></summary>
    <p class="muted">The recipient sets their own password from a secure email link. No password is shown to you.</p>

    {#if form?.error}
      <p class="notice error" role="alert">{form.error}</p>
    {/if}

    <form class="create-grid" method="POST" action="?/create">
      <label class="field">
        <span>Name</span>
        <input name="name" required autocomplete="off" value={form?.values?.name ?? ''} />
      </label>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" required autocomplete="off" value={form?.values?.email ?? ''} />
      </label>
      <label class="field">
        <span>Account type</span>
        <select name="account_type" value={form?.values?.accountType ?? 'learner'}>
          <option value="learner">Learner</option>
          <option value="administrator">Administrator</option>
        </select>
      </label>
      <div class="submit-cell">
        <button class="button primary" type="submit">Create account</button>
      </div>
    </form>
  </details>

  <section class="card stack">
    <div class="section-heading">
      <div>
        <h2>Account directory</h2>
        <p class="muted">Preview-only Administrator identities are managed separately and are not shown here.</p>
      </div>
    </div>

    <form class="search-form" method="GET">
      <label class="field compact">
        <span>Search by</span>
        <select name="field" value={data.searchField}>
          <option value="name">Name</option>
          <option value="email">Email</option>
        </select>
      </label>
      <label class="field search-input">
        <span>Search</span>
        <input name="q" value={data.search} placeholder={data.searchField === 'email' ? 'Email contains…' : 'Name contains…'} />
      </label>
      <div class="search-actions">
        <button class="button" type="submit">Search</button>
        {#if data.search}
          <a class="button secondary" href="/admin/accounts">Clear</a>
        {/if}
      </div>
    </form>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Type</th>
            <th>Status</th>
            <th>Created</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each data.accounts as account}
            <tr>
              <td>
                <strong>{account.name || 'Unnamed account'}</strong>
                {#if account.hasPreviewAccess}
                  <div class="subtle">Also has Preview Admin access</div>
                {/if}
              </td>
              <td>{account.email}</td>
              <td>{account.accountType}</td>
              <td><span class:disabled={account.status === 'Disabled'} class="status-badge">{account.status}</span></td>
              <td>{formatDate(account.createdAt)}</td>
              <td class="row-action"><a href={`/admin/accounts/${encodeURIComponent(account.id)}`}>Manage</a></td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="empty">No matching production accounts on this page.</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pagination" aria-label="Account pages">
      <span class="muted">Page {data.page}</span>
      <div class="actions">
        {#if data.hasPrevious}<a class="button secondary" href={pageHref(data.page - 1)}>Previous</a>{/if}
        {#if data.hasNext}<a class="button secondary" href={pageHref(data.page + 1)}>Next</a>{/if}
      </div>
    </div>
  </section>
</div>

<style>
  .page-heading, .section-heading, .pagination { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .eyebrow { margin: 0 0 0.25rem; color: #667085; font-size: 0.8rem; font-weight: 750; text-transform: uppercase; letter-spacing: 0.05em; }
  h1, h2, p { margin-top: 0; }
  h2 { margin-bottom: 0.25rem; }
  .card { padding: 1.25rem; border: 1px solid #dfe5ee; border-radius: 10px; background: white; }
  details summary { cursor: pointer; }
  .create-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(160px, 0.6fr) auto; gap: 0.9rem; align-items: end; }
  .field { display: grid; gap: 0.35rem; font-weight: 650; }
  .field span { font-size: 0.9rem; }
  input, select { width: 100%; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: inherit; }
  .search-form { display: grid; grid-template-columns: 160px minmax(240px, 1fr) auto; gap: 0.75rem; align-items: end; }
  .search-actions, .actions { display: flex; gap: 0.5rem; align-items: center; }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0.6rem 0.9rem; border: 1px solid #bcc8d8; border-radius: 8px; background: #fff; color: #223047; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
  .button.primary { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
  .button.secondary { background: #f8fafc; }
  .notice { margin: 0; padding: 0.8rem 1rem; border-radius: 8px; }
  .notice.success { border: 1px solid #9bd3ae; background: #effaf2; }
  .notice.error { border: 1px solid #efb3b3; background: #fff1f1; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.8rem 0.6rem; border-bottom: 1px solid #e8edf3; text-align: left; vertical-align: top; }
  th { color: #667085; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .row-action { text-align: right; white-space: nowrap; }
  .subtle { margin-top: 0.15rem; color: #667085; font-size: 0.8rem; }
  .status-badge { display: inline-flex; padding: 0.15rem 0.5rem; border-radius: 999px; background: #e9f8ee; color: #176b37; font-size: 0.82rem; font-weight: 700; }
  .status-badge.disabled { background: #f1f3f5; color: #596273; }
  .empty { color: #667085; text-align: center; }
  .muted { color: #667085; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 1050px) {
    .create-grid { grid-template-columns: 1fr 1fr; }
    .submit-cell { align-self: end; }
  }
  @media (max-width: 720px) {
    .create-grid, .search-form { grid-template-columns: 1fr; }
    .page-heading, .section-heading, .pagination { display: grid; }
  }
</style>
