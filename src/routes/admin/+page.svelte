<script>
  import SignOutButton from '$lib/components/SignOutButton.svelte';

  let { data } = $props();
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
</main>
