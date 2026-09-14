<script>
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let submitting = $state(false);

  function enhanceRequest() {
    submitting = true;
    /** @param {{ update: () => Promise<void> }} context */
    return async ({ update }) => {
      await update();
      submitting = false;
    };
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

    {#if form?.submitted}
      <div class="stack" aria-live="polite">
        <p class="success">{form.message}</p>
        <p class="muted">Check your inbox and spam folder. The reset link expires after 1 hour.</p>
        <div class="actions">
          <a class="button primary" href="/sign-in">Back to sign in</a>
        </div>
      </div>
    {:else}
      <form class="stack" method="POST" use:enhance={enhanceRequest}>
        <label class="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autocomplete="email"
            required
            disabled={!data.authConfigured || submitting}
          />
        </label>

        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

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

  .error {
    margin: 0;
    color: #b42318;
  }
</style>
