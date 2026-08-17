<script>
  import AdminImageLibrary from '$lib/components/AdminImageLibrary.svelte';

  let { data, form } = $props();
</script>

<AdminImageLibrary {data} {form} previewMode />
