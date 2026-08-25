<script>
  let { data, form } = $props();

  /** @type {Record<string, string>} */
  const statusMessages = {
    created: 'Account created and set-password email requested.',
    'created-email-failed': 'Account created, but the set-password email could not be delivered. The account was preserved; retry below.',
    'set-password-sent': 'Set-password email sent.',
    'password-reset-sent': 'Password-reset email sent.',
    promoted: 'Account promoted to Administrator.',
    demoted: 'Account changed to Learner.',
    disabled: 'Account disabled. Existing sessions were revoked.',
    restored: 'Account restored. Previously revoked sessions remain revoked; the user must sign in again.',
    'sessions-revoked': 'All sessions for this account were revoked.'
  };

  /** @param {string | null} value */
  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  /** @param {SubmitEvent} event @param {string} message */
  function confirmAction(event, message) {
    if (!window.confirm(message)) event.preventDefault();
  }
</script>

<svelte:head>
  <title>{data.account.name || data.account.email} | Accounts</title>
</svelte:head>

<div class="stack">
  <div class="page-heading">
    <div>
      <a class="back-link" href="/admin/accounts">← Accounts</a>
      <h1>{data.account.name || 'Unnamed account'}</h1>
      <p class="muted">{data.account.email}</p>
    </div>
    <div class="badges">
      <span class="badge">{data.account.accountType}</span>
      <span class:disabled={data.account.status === 'Disabled'} class="badge status">{data.account.status}</span>
    </div>
  </div>

  {#if data.status && statusMessages[data.status]}
    <p class:warning={data.status === 'created-email-failed'} class="notice" role="status">{statusMessages[data.status]}</p>
  {/if}
  {#if form?.error}
    <p class="notice error" role="alert">{form.error}</p>
  {/if}

  <section class="card stack">
    <h2>Account details</h2>
    <dl class="details-grid">
      <div><dt>Name</dt><dd>{data.account.name || '—'}</dd></div>
      <div><dt>Email</dt><dd>{data.account.email}</dd></div>
      <div><dt>Account type</dt><dd>{data.account.accountType}</dd></div>
      <div><dt>Status</dt><dd>{data.account.status}</dd></div>
      <div><dt>Created</dt><dd>{formatDate(data.account.createdAt)}</dd></div>
      <div><dt>Preview access</dt><dd>{data.account.hasPreviewAccess ? 'Retained Preview Admin access' : 'No'}</dd></div>
    </dl>
    {#if data.account.hasPreviewAccess}
      <p class="muted compact-note">
        Preview Admin is a separate retained role. Production role changes preserve Preview access rather than converting it into a Learner role.
      </p>
    {/if}
  </section>

  <section class="card stack">
    <div>
      <h2>Password email</h2>
      <p class="muted">Better Auth owns the secure reset token. No password or token is shown to the Administrator.</p>
    </div>
    <div class="actions">
      <form method="POST" action="?/sendPasswordReset">
        <button class="button" type="submit">Send password-reset email</button>
      </form>
      {#if data.status === 'created-email-failed'}
        <form method="POST" action="?/sendSetPassword">
          <button class="button primary" type="submit">Resend set-password email</button>
        </form>
      {/if}
    </div>
  </section>

  <section class="card stack">
    <div>
      <h2>Account type</h2>
      <p class="muted">Role changes are enforced server-side. The signed-in Administrator and the last active Production Administrator are protected from lockout.</p>
    </div>

    {#if data.isCurrentAccount}
      <p class="muted">You cannot demote your own Production Administrator account here.</p>
    {:else if data.account.accountType === 'Learner'}
      <form method="POST" action="?/promote" onsubmit={(event) => confirmAction(event, 'Promote this Learner to Production Administrator?')}>
        <button class="button primary" type="submit">Promote to Administrator</button>
      </form>
    {:else}
      <form method="POST" action="?/demote" onsubmit={(event) => confirmAction(event, data.account.hasPreviewAccess ? 'Remove Production Administrator access? Preview Admin access will be retained.' : 'Change this Administrator to a Learner?')}>
        <button class="button danger-outline" type="submit">Change to Learner</button>
      </form>
    {/if}
  </section>

  <section class="card stack">
    <div>
      <h2>Sessions</h2>
      <p class="muted">Use this for a lost device, suspected compromise, or forced reauthentication.</p>
    </div>
    {#if data.isCurrentAccount}
      <p class="muted">Self-session management is not part of this Admin Accounts surface.</p>
    {:else}
      <form method="POST" action="?/revokeSessions" onsubmit={(event) => confirmAction(event, 'Revoke all sessions for this account? The user will need to sign in again.')}>
        <button class="button danger-outline" type="submit">Revoke all sessions</button>
      </form>
    {/if}
  </section>

  <section class="card stack danger-zone">
    <div>
      <h2>{data.account.status === 'Disabled' ? 'Restore account' : 'Disable account'}</h2>
      {#if data.account.status === 'Disabled'}
        <p class="muted">Restore permits future sign-in but does not restore old sessions.</p>
      {:else}
        <p class="muted">Disable preserves the account and learning history, prevents sign-in, and revokes existing sessions. Accounts are not hard-deleted here.</p>
      {/if}
    </div>

    {#if data.account.status === 'Disabled'}
      <form method="POST" action="?/restore">
        <button class="button primary" type="submit">Restore account</button>
      </form>
    {:else if data.isCurrentAccount}
      <p class="muted">You cannot disable your own account here.</p>
    {:else}
      <form method="POST" action="?/disable" onsubmit={(event) => confirmAction(event, 'Disable this account and revoke all of its sessions?')}>
        <button class="button danger" type="submit">Disable account</button>
      </form>
    {/if}
  </section>
</div>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .back-link { display: inline-block; margin-bottom: 0.6rem; color: #475467; text-decoration: none; }
  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: 0.25rem; }
  h2 { margin-bottom: 0.35rem; }
  .muted { color: #667085; }
  .card { padding: 1.25rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .details-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: 0; }
  dt { margin-bottom: 0.2rem; color: #667085; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .compact-note { margin-bottom: 0; }
  .badges, .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .badge { display: inline-flex; padding: 0.25rem 0.6rem; border-radius: 999px; background: #edf2ff; color: #2949a6; font-size: 0.84rem; font-weight: 750; }
  .badge.status { background: #e9f8ee; color: #176b37; }
  .badge.status.disabled { background: #f1f3f5; color: #596273; }
  .notice { margin: 0; padding: 0.8rem 1rem; border: 1px solid #9bd3ae; border-radius: 8px; background: #effaf2; }
  .notice.warning { border-color: #f0c36d; background: #fff8e8; }
  .notice.error { border-color: #efb3b3; background: #fff1f1; }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0.6rem 0.9rem; border: 1px solid #bcc8d8; border-radius: 8px; background: #fff; color: #223047; font: inherit; font-weight: 700; cursor: pointer; }
  .button.primary { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
  .button.danger { border-color: #b42318; background: #b42318; color: #fff; }
  .button.danger-outline { border-color: #d92d20; color: #b42318; }
  .danger-zone { border-color: #f3c4c0; }
  @media (max-width: 760px) {
    .page-heading { display: grid; }
    .details-grid { grid-template-columns: 1fr; }
  }
</style>
