import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// PREVIEW-ONLY configuration (branch preview/ui-redesign — never merge into main).
// Every build of this branch is an isolated UI review build:
//  - src/supabase.js is replaced by src/dev/fixtureSupabase.js (invented in-memory data, server functions blocked),
//    so the real Supabase client, URL and anon key are not bundled;
//  - @stripe/stripe-js is replaced by a stub (Stripe.js never loads) and pk_ keys are blanked;
//  - the build fails if the output still mentions a Supabase host, a Stripe key or Stripe.js.
const real = path.resolve(import.meta.dirname, 'src/supabase.js')
const fake = path.resolve(import.meta.dirname, 'src/dev/fixtureSupabase.js')
const stripeStub = path.resolve(import.meta.dirname, 'src/dev/stripeStub.js')

function fixtureBackend() {
  return {
    name: 'modus-preview-fixture-backend',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null
      if (source === '@stripe/stripe-js') return stripeStub
      if (!/supabase(\.js)?$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && path.normalize(resolved.id) === path.normalize(real) ? fake : null
    },
    transform(code, id) {
      if (/node_modules/.test(id) || !/pk_(live|test)_/.test(code)) return null
      return { code: code.replace(/pk_(live|test)_[A-Za-z0-9]+/g, ''), map: null }
    },
  }
}

function isolationGuard() {
  const banned = [/supabase\.co/i, /ynbxdbwxdydbpkzaffte/, /pk_live_/, /pk_test_/, /sk_(live|test)_/, /js\.stripe\.com/]
  return {
    name: 'modus-preview-isolation-guard',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [file, out] of Object.entries(bundle)) {
        const text = out.type === 'chunk' ? out.code : String(out.source)
        for (const re of banned) if (re.test(text)) this.error(`preview isolation: ${file} matches ${re}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), fixtureBackend(), isolationGuard()],
})
