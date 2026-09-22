<script>
  import { renderMarkdown } from '$lib/markdown.js';

  let { source = '', class: className = '' } = $props();
  let html = $derived(renderMarkdown(source));
</script>

<div class={`markdown-content ${className}`}>
  {@html html}
</div>

<style>
  .markdown-content { min-width: 0; line-height: 1.6; overflow-wrap: anywhere; }
  .markdown-content :global(:first-child) { margin-top: 0; }
  .markdown-content :global(:last-child) { margin-bottom: 0; }
  .markdown-content :global(p), .markdown-content :global(ul), .markdown-content :global(ol), .markdown-content :global(blockquote), .markdown-content :global(pre), .markdown-content :global(table) { margin: .65rem 0; }
  .markdown-content :global(ul), .markdown-content :global(ol) { padding-left: 1.35rem; }
  .markdown-content :global(blockquote) { padding-left: .85rem; border-left: 3px solid #cdd6e3; color: #475467; }
  .markdown-content :global(code) { padding: .1rem .25rem; border-radius: 4px; background: #eef2f6; font-size: .9em; }
  .markdown-content :global(pre) { overflow-x: auto; padding: .75rem; border-radius: 8px; background: #172033; color: #fff; }
  .markdown-content :global(pre code) { padding: 0; background: transparent; }
  .markdown-content :global(table) { width: 100%; border-collapse: collapse; font-size: .95em; }
  .markdown-content :global(th), .markdown-content :global(td) { padding: .5rem .6rem; border: 1px solid #dfe5ee; text-align: left; vertical-align: top; }
  .markdown-content :global(th) { background: #f8fafc; }
  .markdown-content :global(a) { color: #175cd3; text-decoration: underline; text-underline-offset: .12em; }
</style>
