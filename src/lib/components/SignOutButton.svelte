<script>
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client.js';

  let signingOut = $state(false);

  async function signOut() {
    signingOut = true;
    await authClient.signOut();
    await goto('/sign-in');
  }
</script>

<button class="button" type="button" onclick={signOut} disabled={signingOut}>
  {signingOut ? 'Signing out…' : 'Sign out'}
</button>
