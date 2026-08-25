<script>
  import { onMount } from 'svelte';

  import { authClient } from '$lib/auth-client.js';

  let { data } = $props();

  let token = $state('');
  let linkReady = $state(false);
  let invalidLink = $state(false);
  let password = $state('');
  let confirmPassword = $state('');
  let errorMessage = $state('');
  let submitting = $state(false);
  let completed = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    token = params.get('token') ?? '';
    invalidLink = !token || params.get('error') === 'INVALID_TOKEN';
    linkReady = true;

    // Keep the Better Auth token only in browser memory after initial parsing so
    // it cannot leak through same-origin referrer logs or subsequent navigation.
    window.history.replaceState(window.history.state, '', '/reset-password');
  });

  /** @param {unknown} error */
  function resetErrorMessage(error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'INVALID_TOKEN') {
        return 'This password reset link is invalid or has expired.';
      }
      if (error.code === 'PASSWORD_TOO_SHORT') {
        return 'That password is too short.';
      }
      if (error.code === 'PASSWORD_TOO_LONG') {
        return 'That password is too long.';
      }
    }

    return 'Unable to reset your password. Request a new password reset email and try again.';
  }

  /** @param {SubmitEvent} event */
  async function resetPassword(event) {
    event.preventDefault();
    errorMessage = '';

    if (password !== confirmPassword) {
      errorMessage = 'The passwords do not match.';
      return;
    }

    if (!token) {
      invalidLink = true;
      return;
    }

    submitting = true;
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token
    });
    submitting = false;

    if (error) {
      errorMessage = resetErrorMessage(error);
      if (error.code === 'INVALID_TOKEN') invalidLink = true;
      return;
    }

    token = '';
    password = '';
    confirmPassword = '';
    completed = true;
  }
</script>

<svelte:head>
  <title>Reset password | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Private learning application</p>
      <h1>Reset password</h1>
      <p>Choose a new password for your Flash-Cards account.</p>
    </div>

    {#if !data.authConfigured}
      <p class="notice">
        Authentication is not connected yet because the Cloudflare D1 binding and Better Auth secret
        have not been configured.
      </p>
    {/if}

    {#if completed}
      <div class="stack" aria-live="polite">
        <p class="success">Your password has been changed. Previous sessions have been revoked.</p>
        <div class="actions">
          <a class="button primary" href="/sign-in">Sign in with new password</a>
        </div>
      </div>
    {:else if linkReady && invalidLink}
      <div class="stack">
        <p class="error" role="alert">This password reset link is invalid or has expired.</p>
        <p class="muted">Request a new reset email to continue.</p>
        <div class="actions">
          <a class="button primary" href="/forgot-password">Request a new reset link</a>
          <a class="button" href="/sign-in">Back to sign in</a>
        </div>
      </div>
    {:else if linkReady}
      <form class="stack" onsubmit={resetPassword}>
        <label class="field">
          <span>New password</span>
          <input
            bind:value={password}
            type="password"
            autocomplete="new-password"
            required
            disabled={!data.authConfigured || submitting}
          />
        </label>

        <label class="field">
          <span>Confirm new password</span>
          <input
            bind:value={confirmPassword}
            type="password"
            autocomplete="new-password"
            required
            disabled={!data.authConfigured || submitting}
          />
        </label>

        {#if errorMessage}
          <p class="error" role="alert">{errorMessage}</p>
        {/if}

        <div class="actions">
          <button class="button primary" type="submit" disabled={!data.authConfigured || submitting}>
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
          <a class="button" href="/sign-in">Back to sign in</a>
        </div>
      </form>
    {/if}
  </section>
</main>

<style>
  .field {
    display: grid;
    gap: 0.4rem;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #cdd6e3;
    border-radius: 8px;
    background: white;
  }

  input:disabled {
    background: #f2f4f7;
  }

  .notice {
    padding: 0.8rem 1rem;
    border: 1px solid #f0c36d;
    border-radius: 8px;
    background: #fff8e8;
  }

  .success {
    margin: 0;
    padding: 0.8rem 1rem;
    border: 1px solid #9bd3ae;
    border-radius: 8px;
    background: #effaf2;
  }

  .error {
    margin: 0;
    color: #b42318;
  }
</style>
