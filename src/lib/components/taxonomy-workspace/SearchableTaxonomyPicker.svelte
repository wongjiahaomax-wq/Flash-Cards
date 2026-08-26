<script lang="ts">
  import type { SearchableTaxonomyOption } from './taxonomy-picker-model.ts';

  let {
    value = $bindable(''),
    options,
    label,
    searchPlaceholder = 'Search…',
    emptyLabel = null,
    disabled = false
  }: {
    value?: string;
    options: SearchableTaxonomyOption[];
    label: string;
    searchPlaceholder?: string;
    emptyLabel?: string | null;
    disabled?: boolean;
  } = $props();

  let query = $state('');
  const filtered = $derived(options.filter((option) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return `${option.label} ${option.searchLabel ?? ''} ${option.meta ?? ''}`.toLocaleLowerCase().includes(needle);
  }));
</script>

<div class="picker">
  <label>
    <span>{label}</span>
    <input bind:value={query} placeholder={searchPlaceholder} disabled={disabled} />
  </label>
  <select bind:value={value} disabled={disabled} aria-label={label}>
    {#if emptyLabel !== null}<option value="">{emptyLabel}</option>{/if}
    {#each filtered as option (option.id)}
      <option value={option.id}>{option.displayLabel ?? option.label}{option.meta ? ` · ${option.meta}` : ''}</option>
    {/each}
  </select>
  {#if query && filtered.length === 0}
    <span class="empty">No matching options.</span>
  {/if}
</div>

<style>
  .picker { display: grid; gap: .4rem; }
  label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  input,select { box-sizing: border-box; width: 100%; padding: .62rem .68rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  input:disabled,select:disabled { opacity: .55; cursor: not-allowed; }
  .empty { color: #667085; font-size: .8rem; }
</style>
