<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Study | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Signed in as {data.user.email}</p>
      <h1>Study</h1>
      <p>
        The next implementation step here is the Concept selector and the seeded
        Case review workflow using the V1 selection engine.
      </p>
    </div>

    <div class="actions">
      <a class="button" href="/">Home</a>
      <SignOutButton />
    </div>
  </section>
</main>
