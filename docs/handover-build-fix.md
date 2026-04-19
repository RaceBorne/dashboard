# Handover: production build fix (`yauzl` / `fs` in client bundle)

## What was wrong

`next build` failed with **Module not found: Can't resolve 'fs'`** coming from **`yauzl`** (zip reader).

**Import chain:**

1. `components/shopify/SeoHealthClient.tsx` is a **client component** (`'use client'`).
2. It imports `CHECKS` from `lib/seo/checks.ts`.
3. `checks.ts` imported **`containsBannedWord`** from `lib/ai/evari-seo.ts`.
4. `evari-seo.ts` imports **`buildSystemPrompt`** from `lib/ai/gateway.ts`.
5. `gateway.ts` imports **`loadEvariCopySkill`** from `lib/ai/skill.ts`.
6. `skill.ts` uses **`node:fs`**, **`path`**, and **`yauzl`** to read the `.skill` zip — **server-only**.

Bundling that for the browser is invalid and Turbopack correctly errors.

## What we changed

| File | Change |
|------|--------|
| **`lib/seo/copy-rules.ts`** *(new)* | Holds **only** pure rules: `BANNED_WORDS`, `containsBannedWord`, `stripDashes`, `unquote`. No AI, no `fs`, no gateway. Safe for client + server. |
| **`lib/seo/checks.ts`** | Import `containsBannedWord` from **`@/lib/seo/copy-rules`** instead of `@/lib/ai/evari-seo`. |
| **`lib/ai/evari-seo.ts`** | Imports those four symbols from `copy-rules` and **re-exports** them so existing callers (`generate` route, `fix.ts`) stay unchanged. |
| **`next.config.ts`** | Moved **`typedRoutes: false`** to the **top level** (Next.js 16 — it was under `experimental` and warned). |

## Rule for future edits

**Anything imported by client components** (or by modules shared with client) must not depend on:

- `lib/ai/gateway.ts`
- `lib/ai/skill.ts`
- `node:fs` / `yauzl` / other Node-only packages

Keep **pure validation / constants** in small modules like `copy-rules.ts` and import those from both client and server code.

## Verification

```bash
npm run build
```

Should complete with **✓ Compiled successfully** (you may still see a **non-fatal** Turbopack NFT warning tracing `next.config` → `skill.ts` from some server routes; that does not fail the build).
