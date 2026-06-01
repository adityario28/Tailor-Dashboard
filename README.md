# Tailor Dashboard

Aplikasi manajemen pesanan jahit berbasis web dengan dukungan offline-first menggunakan Dexie (IndexedDB) dan sinkronisasi ke Supabase.

## Fitur

- **Input pesanan baru** — form lengkap dengan 8 field ukuran, jenis pakaian, dan catatan
- **Pencarian pelanggan** — cari pelanggan dari data lokal (Dexie) maupun Supabase
- **Profil ukuran (preset)** — simpan dan muat ulang ukuran pelanggan yang sudah tersimpan
- **Sketsa interaktif** — badge ukuran pada sketsa pakaian aktif saat field sedang diisi
- **Offline-first** — semua data disimpan lokal di IndexedDB, disinkronkan ke Supabase saat online
- **Dashboard pesanan** — tampilan daftar pesanan dengan update status langsung
- **Sinkronisasi otomatis** — data pending disinkronkan saat koneksi kembali tersedia

## Tech Stack

- [Astro](https://astro.build) — framework utama
- [React](https://react.dev) — komponen interaktif
- [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) — styling & UI
- [Dexie](https://dexie.org) — IndexedDB wrapper (offline storage)
- [Supabase](https://supabase.com) — backend & database (schema: `trx`)

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```

2. Buat file `.env` di root project:
   ```env
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Pastikan schema `trx` di Supabase sudah memiliki tabel berikut dan sudah di-expose:
   - `customer` — `id, name, phone, sex`
   - `preset_customer` — `id, customer_id, preset_name, outfit_type, panjang_kain, lebar_kain, ...ukuran`
   - `transaction` — `id, customer_id, preset_id, outfit_type, panjang_kain, lebar_kain, status, ...ukuran`

## Commands

| Command         | Action                                      |
| :-------------- | :------------------------------------------ |
| `npm run dev`   | Jalankan dev server di `localhost:4321`     |
| `npm run build` | Build production ke `./dist/`               |
| `npm run preview` | Preview hasil build secara lokal          |

## Reset Data Lokal

Untuk menghapus semua data Dexie dari browser:
```js
indexedDB.deleteDatabase('TailorDB')
```
Jalankan di DevTools console, lalu refresh halaman.
