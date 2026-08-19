import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      // Vite development shares Wrangler's persistent local D1/R2 state, but
      // ordinary localhost runtime must never connect bindings to production.
      platformProxy: {
        persist: true,
        remoteBindings: false
      }
    })
  }
};

export default config;
