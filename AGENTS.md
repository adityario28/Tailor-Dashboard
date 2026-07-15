# AGENTS.md

Quick reference for OpenCode agents working on this tailor shop order management system.

## Project Overview

**Tailor Dashboard** — offline-first web app for Indonesian tailor shops. Takes customer measurements, stores orders locally (Dexie/IndexedDB), syncs to Supabase when online.

**Stack:**
- Astro 6 (framework)
- React 19 (interactive islands with `client:only="react"` or `client:load`)
- Tailwind CSS v4 (no config file — uses `@tailwindcss/vite` plugin)
- shadcn/ui components (configured via `components.json`, path aliases via `tsconfig.json`)
- Dexie 4 (IndexedDB wrapper)
- Supabase (backend, schema: `trx`)

**Language:** UI and comments are in Indonesian. Code identifiers are English.

## Commands

```sh
npm run dev      # dev server at localhost:4321
npm run build    # production build to ./dist/
npm run preview  # preview built site
```

**Node requirement:** `>=22.12.0` (enforced in package.json)

No test suite, linter, or formatter configured.

## Architecture

**Pages (Astro):**
- `/` → redirects to `/dashboard`
- `/dashboard.astro` — order list, metrics, status updates (vanilla JS)
- `/new-order.astro` — thin wrapper that renders OrderForm component
- `/order.astro` — thin wrapper that renders OrderDetail component

**Data flow:**
1. All writes go to Dexie first (`db.transaction`, `db.customer`, `db.preset_customer`)
2. Records created with `synced: false`
3. `syncPending()` runs on page load and when `online` event fires
4. Sync functions (`syncCustomer`, `syncPreset`, `syncTransaction`) push to Supabase and mark `synced: true`
5. Dashboard merges local + remote records, deduplicating by fingerprint (customer name + outfit_type + measurements)

**Key files:**
- `src/lib/db.ts` — Dexie schema (v7), TypeScript types, sync logic
- `src/lib/supabase.ts` — Supabase client, `trx` schema accessor
- `src/components/CustomerSearch.tsx` — customer search/autocomplete with preset loading
- `src/components/measurementSketch.tsx` — interactive SVG sketch that highlights active measurement field
- `src/components/OrderForm.tsx` — React form component (571 lines), handles new order creation with React state
- `src/components/OrderDetail.tsx` — React component (293 lines), handles order detail view and status updates

**Supabase schema `trx`:**
- `customer` — id, name, phone, sex
- `preset_customer` — saved size profiles per customer
- `transaction` — orders with measurements, outfit_type, status

## Critical Conventions

**Measurement field switching:**
Three outfit types have different required fields:
- **Jas (Jacket):** 8 fields (panjangBadan, lebarBahu, panjangLengan, lingkarLengan, lingkarUjungLengan, lingkarDada, lingkarPerut, lingkarPinggul)
- **Kemeja Lengan Panjang (Long-sleeve shirt):** 8 fields (lingkarLeher, lebarBahu, panjangLengan, lingkarDada, lingkarPerut, panjangBadan, lingkarUjungLengan, lingkarPinggul)
- **Kemeja Lengan Pendek (Short-sleeve shirt):** 8 fields (lingkarLeher, lebarBahu, panjangLengan, lebarPundak, lingkarDada, panjangBadan, lingkarLengan, lingkarPinggul)

Switching is handled in `OrderForm.tsx` via conditional rendering — only the active outfit type's fields are rendered, eliminating duplicate ID issues.

**Default cloth dimensions:**
Auto-filled when outfit type changes. Defined in `PANJANG_KAIN_DEFAULT` and `LEBAR_KAIN_DEFAULT` constants in `OrderForm.tsx`.

**Status flow (forward-only):**
`['Cuci Bahan', 'Potong Bahan', 'Jahit', 'Finishing', 'Siap Diambil']`

Dropdowns only show current status and forward steps. Implemented in `dashboard.astro:192` and `OrderDetail.tsx`.

**Syncing customer/preset references:**
Dexie auto-increment IDs ≠ Supabase IDs. When syncing transactions/presets that reference a customer:
- If customer is unsynced, sync it first, capture Supabase ID
- Build `customerIdMap` (dexieId → supabaseId) in `syncPending()` (db.ts:114)
- Pass mapped Supabase customer_id when inserting to Supabase

**React hydration:**
Use `client:only="react"` for components that depend on browser APIs (IndexedDB, localStorage). Use `client:load` for simple interactive elements (checkboxes).

**Custom events for cross-component communication:**
- `customer-selected` — CustomerSearch → new-order form
- `outfit-changed` — Combobox → form script
- `outfit-update` — form → measurementSketch
- `measurement-update` — form input → measurementSketch
- `measurement-focus` — form focus → measurementSketch (highlights badge)
- `measurement-reset` — after successful save
- `order-success` — triggers SuccessDialog

## Known Issues & Gotchas

**React form refactoring (2026-07-06):**
The form handling has been refactored from vanilla JS to React. The old duplicate ID issue no longer exists — OrderForm.tsx now conditionally renders only the active outfit type's fields using React state.

**Measurement sketch synchronization:**
`measurementSketch.tsx` listens to custom events but needs `(window as any).__lastOutfit` to be set for correct field mapping. Make sure to dispatch `outfit-update` event AND set `__lastOutfit` when switching outfit types or loading presets.

**Print receipt (disabled):**
Print receipt functionality is currently disabled in the OrderForm component. Can be re-enabled by implementing the print logic in the form submit handler.

**Tailwind v4 + Vite plugin:**
No `tailwind.config.js` — Tailwind CSS v4 is loaded via `@tailwindcss/vite` plugin in `astro.config.mjs`. CSS variables and theme config are in `src/styles/global.css`.

**Path aliases:**
`@/*` maps to `src/*` (configured in both `tsconfig.json` and `astro.config.mjs`).

## Planned Features

See `next_session.md` for detailed roadmap. Key upcoming work:
- **Down payment (DP) flow:** add `amount_paid` field, print DP receipt, add "Lunas" (paid off) button in dashboard
- **Settlement print:** final receipt showing DP + remaining payment

## Testing

No automated tests. Manual testing checklist in `next_session.md:24-48`. Key flows:
1. Create order → check IndexedDB → verify print dialog
2. Search customer → load preset → verify fields populate
3. Save new preset → reload → verify preset appears
4. Go offline → create order → go online → verify sync
5. Update status in dashboard → verify both local and Supabase update

## Debug Commands

Reset local database from browser console:
```js
indexedDB.deleteDatabase('TailorDB')
```

Check sync status:
```js
await db.transaction.toArray().then(arr => arr.filter(t => !t.synced))
```

Force sync:
```js
import { syncPending } from '@/lib/db';
await syncPending();
```

## Environment

`.env` must contain:
```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

Both `PUBLIC_*` and `VITE_*` prefixes are supported (fallback in `supabase.ts:4`).
