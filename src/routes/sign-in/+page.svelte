<script>
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client.js';

  let { data } = $props();

  let email = $state('');
  let password = $state('');
  let errorMessage = $state('');
  let submitting = $state(false);

  /** @param {SubmitEvent} event */
  async function signIn(event) {
    event.preventDefault();
    errorMessage = '';
    submitting = true;

    const { error } = await authClient.signIn.email({
      email,
      password
    });

    submitting = false;

    if (error) {
      errorMessage = error.message || 'Unable to sign in.';
      return;
    }

    const requested = new URLSearchParams(window.location.search).get('redirect');
    const destination = requested?.startsWith('/') && !requested.startsWith('//')
      ? requested
      : data.defaultDestination ?? '/admin';
    await goto(destination);
  }
</script>

<svelte:head>
  <title>Sign in | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Private learning application</p>
      <h1>Sign in</h1>
      <p>Use the learner or administrator account issued to you.</p>
    </div>

    {#if !data.authConfigured}
      <p class="notice">
        Authentication is not connected yet because the Cloudflare D1 binding and Better Auth secret
        have not been configured.
      </p>
    {/if}

    <form class="stack" onsubmit={signIn}>
      <label class="field">
        <span>Email</span>
        <input bind:value={email} type="email" autocomplete="email" required disabled={!data.authConfigured || submitting} />
      </label>

      <label class="field">
        <span>Password</span>
        <input
          bind:value={password}
          type="password"
          autocomplete="current-password"
          required
          disabled={!data.authConfigured || submitting}
        />
      </label>

      <a class="forgot-password" href="/forgot-password">Forgot password?</a>

      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}

      <div class="actions">
        <button class="button primary" type="submit" disabled={!data.authConfigured || submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <a class="button" href="/">Back home</a>
      </div>
    </form>
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

  .forgot-password {
    width: fit-content;
  }

  .notice {
    padding: 0.8rem 1rem;
    border: 1px solid #f0c36d;
    border-radius: 8px;
    background: #fff8e8;
  }

  .error {
    margin: 0;
    color: #b42318;
  }
</style>
