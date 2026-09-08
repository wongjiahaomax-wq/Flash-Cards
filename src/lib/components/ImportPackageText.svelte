<script>
  let { value = '' } = $props();
</script>

<span class="package-text">{value}</span>

<style>
  .package-text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
