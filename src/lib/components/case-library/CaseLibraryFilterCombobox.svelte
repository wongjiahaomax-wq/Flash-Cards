<script lang="ts">
  import type { SearchableTaxonomyOption } from '../taxonomy-workspace/taxonomy-picker-model.ts';

  let {
    value = $bindable(''),
    name,
    options,
    label,
    placeholder = 'Search…',
    emptyLabel = 'All',
    duplicateIdLabel = 'Option ID',
    inputId,
    disabled = false
  }: {
    value?: string;
    name: string;
    options: SearchableTaxonomyOption[];
    label: string;
    placeholder?: string;
    emptyLabel?: string;
    duplicateIdLabel?: string;
    inputId: string;
    disabled?: boolean;
  } = $props();

  let query = $state('');
  let open = $state(false);
  let editing = $state(false);
  let activeIndex = $state(-1);

  const selectedOption = $derived(options.find((option) => option.id === value));
  const matchingOptions = $derived(options.filter((option) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [option.label, option.displayLabel, option.searchLabel, option.meta, option.id]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle);
  }));

  $effect(() => {
    if (!editing) query = selectedOption ? optionDisplayLabel(selectedOption) : '';
  });

  function optionDisplayLabel(option: SearchableTaxonomyOption) {
    return option.displayLabel ?? option.label;
  }

  function duplicateDisplayLabel(option: SearchableTaxonomyOption) {
    const displayLabel = optionDisplayLabel(option);
    return options.some((candidate) => candidate.id !== option.id && optionDisplayLabel(candidate) === displayLabel);
  }

  function resultId(option: SearchableTaxonomyOption) {
    return `${inputId}-option-${option.id}`;
  }

  function restoreCommittedSelection() {
    query = selectedOption ? optionDisplayLabel(selectedOption) : '';
    editing = false;
    open = false;
    activeIndex = -1;
  }

  function updateQuery(nextQuery: string) {
    query = nextQuery;
    editing = true;
    open = true;
    activeIndex = -1;
  }

  function selectOption(option: SearchableTaxonomyOption | null) {
    value = option?.id ?? '';
    query = option ? optionDisplayLabel(option) : '';
    editing = false;
    open = false;
    activeIndex = -1;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      restoreCommittedSelection();
      return;
    }
    if (event.key === 'ArrowDown') {
      if (!matchingOptions.length) return;
      event.preventDefault();
      open = true;
      activeIndex = (activeIndex + 1) % matchingOptions.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!matchingOptions.length) return;
      event.preventDefault();
      open = true;
      activeIndex = activeIndex <= 0 ? matchingOptions.length - 1 : activeIndex - 1;
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      selectOption(matchingOptions[activeIndex]);
      return;
    }
    if (event.key === 'Enter' && editing) {
      event.preventDefault();
      restoreCommittedSelection();
    }
  }
</script>

<label class="search-field" for={inputId}>
  <span>{label}</span>
  <div class="combobox-wrap">
    <input
      id={inputId}
      type="search"
      value={query}
      placeholder={placeholder}
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${inputId}-results`}
      aria-activedescendant={open && activeIndex >= 0 ? resultId(matchingOptions[activeIndex]) : undefined}
      disabled={disabled}
      onfocus={() => (open = true)}
      onblur={restoreCommittedSelection}
      oninput={(event) => updateQuery(event.currentTarget.value)}
      onkeydown={handleKeydown}
    />
    <input type="hidden" name={name} value={value} />
    {#if open}
      <div class="results" id={`${inputId}-results`} role="listbox">
        <button
          type="button"
          class="option"
          role="option"
          aria-selected={!value}
          tabindex="-1"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => selectOption(null)}
        >
          <span>{emptyLabel}</span>
        </button>
        {#if matchingOptions.length}
          {#each matchingOptions as option (option.id)}
            <button
              id={resultId(option)}
              type="button"
              class="option"
              role="option"
              aria-selected={value === option.id}
              tabindex="-1"
              onmousedown={(event) => event.preventDefault()}
              onclick={() => selectOption(option)}
            >
              <span>{optionDisplayLabel(option)}</span>
              {#if option.meta}<small>{option.meta}</small>{/if}
              {#if duplicateDisplayLabel(option)}<small>{duplicateIdLabel}: {option.id}</small>{/if}
            </button>
          {/each}
        {:else}
          <span class="empty">No matching {label} options.</span>
        {/if}
      </div>
    {/if}
  </div>
</label>

<style>
  .search-field { display: grid; gap: 0.4rem; min-width: 0; color: #344054; font-weight: 650; }
  .combobox-wrap { position: relative; min-width: 0; }
  input { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  input:disabled { cursor: not-allowed; opacity: 0.55; }
  .results { position: absolute; z-index: 30; top: calc(100% + 0.25rem); right: 0; left: 0; max-height: 17rem; overflow-y: auto; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; box-shadow: 0 12px 28px rgba(16, 24, 40, 0.16); }
  .option { display: grid; gap: 0.12rem; width: 100%; padding: 0.55rem 0.65rem; border: 0; border-bottom: 1px solid #f2f4f7; background: #fff; color: #172033; text-align: left; cursor: pointer; font: inherit; }
  .option:last-of-type { border-bottom: 0; }
  .option:hover, .option[aria-selected="true"] { background: #f2f4f7; }
  .option small { color: #667085; font-size: 0.68rem; font-weight: 500; overflow-wrap: anywhere; }
  .empty { display: block; padding: 0.65rem; color: #667085; font-size: 0.8rem; font-weight: 500; }
</style>
