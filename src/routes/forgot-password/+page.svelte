<script>
  import { authClient } from '$lib/auth-client.js';

  let { data } = $props();

  let email = $state('');
  let submitting = $state(false);
  let submitted = $state(false);

  /** @param {SubmitEvent} event */
  async function requestPasswordReset(event) {
    event.preventDefault();
    submitting = true;

    try {
      // Better Auth intentionally returns a generic response for unknown users.
      // We also deliberately discard transport/rate-limit/provider errors here
      // so browser-visible state cannot become an account-enumeration oracle.
      await authClient.requestPasswordReset({
        email: email.trim()
      });
    } catch {
      // The learner-facing result remains generic by design.
    } finally {
      submitting = false;
      submitted = true;
    }
  }
</script>

<svelte:head>
  <title>Forgot password | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Private learning application</p>
      <h1>Forgot password?</h1>
      <p>Enter the email address for your Flash-Cards account.</p>
    </div>

    {#if !data.authConfigured}
      <p class="notice">
        Authentication is not connected yet because the Cloudflare D1 binding and Better Auth secret
        have not been configured.
      </p>
    {/if}

    {#if submitted}
      <div class="stack" aria-live="polite">
        <p class="success">
          If an account exists for that email address, we’ve sent password reset instructions.
        </p>
        <p class="muted">Check your inbox and spam folder. The reset link expires after 1 hour.</p>
        <div class="actions">
          <a class="button primary" href="/sign-in">Back to sign in</a>
          <button class="button" type="button" onclick={() => (submitted = false)}>Try another email</button>
        </div>
      </div>
    {:else}
      <form class="stack" onsubmit={requestPasswordReset}>
        <label class="field">
          <span>Email</span>
          <input
            bind:value={email}
            type="email"
            autocomplete="email"
            required
            disabled={!data.authConfigured || submitting}
          />
        </label>

        <div class="actions">
          <button class="button primary" type="submit" disabled={!data.authConfigured || submitting}>
            {submitting ? 'Sending…' : 'Send reset instructions'}
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
</style>
