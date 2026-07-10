# PANDUAN SERAH TUGAS PEMBANGUN (DEVELOPER HANDOVER & ARCHITECTURE GUIDE)
**Sistem:** Operational Hub - Dashboard Syarikat (99 Speed Mart)  
**Dokumen ini disediakan khusus untuk Pembangun Baru (AI mahupun Manusia) yang akan menyambung dan menyelenggara sistem ini.**

---

## 1. RINGKASAN ARKITEKTUR SISTEM (SYSTEM ARCHITECTURE)

- **Frontend & antaramuka utama:** `index.html` (Single-Page Application - Vanilla JavaScript, Tailwind CSS menerusi CDN, Chart.js, FontAwesome).
- **Pangkalan Data (Database):** **Supabase (PostgreSQL / Realtime)**
  - **URL Supabase:** `https://jolrtaqlpqqydncacqza.supabase.co`
  - **SDK:** Supabase JS SDK v2 (`@supabase/supabase-js@2`)
  - **Wrapper Khusus:** Sistem ini menggunakan kelas pembungkus (`SBCollectionRef`, `SBQuery`, `SBDocRef`) dalam `index.html` yang meniru sintaks Firestore (`db.collection('...').where('...').get()`) supaya semua fungsi sedia ada beroperasi secara konsisten di atas Supabase.
- **Deployment & Hosting:** **Vercel** (`dashboard-operation.vercel.app`), bersambung terus secara otomatis (CI/CD) ke repositori **GitHub** (`main` branch).

---

## 2. STRUKTUR PANGKALAN DATA (SUPABASE COLLECTIONS / TABLES)

1. **`submissions` (Data Operasi Harian Cawangan):**
   - **Primary Key (`id`):** `{code}_{YYYY-MM-DD}` (Contoh: `1004_2026-07-10`)
   - **Medan Utama:** `code`, `name`, `am`, `date`, `sales`, `trans`, `mykasih`, `lorry`, `bank1`, `bank2`, `night_locked`, `night_unlocked`, `bank2_unlocked`, `updated_at`.
2. **`config` (Konfigurasi Global & Kunci Sistem):**
   - **Document ID:** `system`
   - **Medan Utama:** `global_lock` (Kunci Utama HQ), `past_lock` (Kunci Tarikh Lepas), `limit_sales`, `limit_mykasih`, `limit_lorry`.
3. **`targets` (Sasaran Jualan Bulanan Cawangan):**
   - **Primary Key (`id`):** `{code}_{YYYY-MM}` (Contoh: `1004_2026-07`)
   - **Medan Utama:** `code`, `month`, `target_sales`.
4. **`monthly_summaries` (Ringkasan Bulanan):**
   - Digunakan sebagai *cache* pantas bagi paparan jadual perbandingan bulanan.

---

## 3. PERATURAN BISNES & LOGIK KRITIKAL (WAJIB DIPATUHI DEVELOPER BARU)

Pembangun baru **DILARANG SAMA SEKALI** mengubah atau merosakkan logik kritikal berikut yang telah diuji 100% stabil:

1. **Pengasingan Ketat Area Manager (AM Isolation):**
   - Gunakan fungsi `getManagerFilteredBranches()` untuk mendapatkan senarai cawangan rasmi bagi Area Manager yang sedang log masuk.
   - Dalam jadual **Lorry Tracker**, **Branch Target Tracker**, dan **Daily Comparison**, sentiasa tapis menggunakan `allowedCodes = new Set(branches.map(b => String(b.code)))`. Dilarang menggunakan `.includes()` atau carian teks longgar.
2. **Kestabilan & Pencegahan Crash Malam (Realtime Debouncing 800ms):**
   - Apabila 3,500 cawangan mengisi data serentak pada waktu malam, pendengar Realtime Supabase menggunakan **debounce 800ms (`debouncedTriggerSync`)** supaya antaramuka tidak membeku (*freeze*). Jangan buang fungsi debounce ini.
3. **Tarikan Data Sales Analytics 100% Lengkap:**
   - Dalam fungsi `fetchSubmissionsChunked(monthStr, amName)`, tarikan database `submissions` **TIDAK BOLEH** ditapis menggunakan `.where('am', '==', amName)` di peringkat database kerana penulisan nama AM dalam pangkalan data mungkin berbeza format. Tarik semua data bulanan (<300ms) dan tapis kod cawangan di peringkat JavaScript.
4. **Penyinkronan Realtime Telefon Bimbit (Mobile Heartbeat 5s):**
   - Browser telefon bimbit menggantungkan Websocket apabila skrin dikunci. Sistem menggunakan `setInterval(..., 5000)` dan pendengar `focus`/`pageshow` pada `configListener.refresh()` supaya perubahan status Unlock/Lock dari laptop dikesan serta-merta di telefon bimbit.

---

## 4. CARA MEMULAKAN TUGAS BAGI DEVELOPER BARU

1. Buka fail `index.html` dan baca dokumen ini (`DEVELOPER_HANDOVER_GUIDE.md`).
2. Untuk menguji sistem secara lokal, buka `index.html` pada browser atau jalankan pelayan lokal (`npx serve .`).
3. Untuk membuat perubahan rasmi:
   - Kemaskini kod dalam `index.html`.
   - Jalankan ujian automasi (contoh: Puppeteer) untuk memastikan tiada ralat konsol (`pageerror`).
   - Commit & push ke GitHub (`main`), dan Vercel akan menerbitkan kemaskini secara automatik dalam masa 30 saat.
