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
3. **Tarikan Data Sales Analytics 100% Lengkap & Pantas (Parallel Batching & `buildRangeQuery`):**
   - Dalam fungsi `fetchSubmissionsChunked` dan `SBQuery.prototype.get()`, tarikan pangkalan data bagi set data besar (60,000+ baris) menggunakan teknik **4-Way Parallel Batching** (tarikan 4 halaman serentak dengan saiz 4,000 baris setiap pusingan).
   - **AMARAN KERAS:** Pembangun baru **WAJIB** menggunakan fungsi pembina berasingan (`buildRangeQuery`) bagi setiap halaman dalam tarikan selari. Perpustakaan `@supabase/supabase-js` memutasi objek parameter apabila `.range(a, b)` dipanggil. Jika objek pertanyaan dikongsi, sistem akan melangkau 3/4 halaman dan menyebabkan kehilangan ribuan baris data cawangan.
4. **Normalisasi Kunci Kanonikal (`getCanonicalSubKey`) Bagi Mencegah Jualan Berganda (*Double Sales*):**
   - Kod cawangan dalam pangkalan data mungkin berformat teks bersifar (`"0012"`, `"01009"`) atau integer (`12`, `1009`).
   - Semua penggabungan data antara `monthly_summaries` dan `submissions` **WAJIB** menggunakan fungsi `getCanonicalSubKey(s)` serta `deduplicateSubmissionsList()` bagi menormalisasikan kod cawangan kepada integer tunggal. Ini menjamin **tiada duplikasi atau jualan berganda** walaupun format kemasukan berbeza.
5. **Kestabilan Isian Malam (`upsert` & *Exponential Backoff Retry*) Bagi 3,500 Cawangan:**
   - Sewaktu waktu kemuncak malam (8:00 PM - 11:00 PM), 3,500 cawangan menekan tombol *Send Data* secara serentak.
   - Semua penulisan jualan menggunakan kaedah `upsert` melalui kelas `SBDocRef.prototype.set(payload, {merge: true})` yang dilengkapi **3x Exponential Backoff Retry (250ms, 375ms, 562ms)** secara automatik. Jangan buang logik *retry* ini bagi memastikan tiada cawangan mengalami *loading lama* atau gagal hantar data semasa gangguan rangkaian sementara.
   - Pembacaan analitik berat oleh Area Manager/HQ dihalakan ke koleksi `monthly_summaries` bagi mengurangkan 95% beban pangkalan data pada jadual `submissions`, memastikan laluan penulisan cawangan sentiasa lancar dan laju.
6. **Penyinkronan Realtime Telefon Bimbit (Mobile Heartbeat 5s):**
   - Browser telefon bimbit menggantungkan Websocket apabila skrin dikunci. Sistem menggunakan `setInterval(..., 5000)` dan pendengar `focus`/`pageshow` pada `configListener.refresh()` supaya perubahan status Unlock/Lock dari laptop dikesan serta-merta di telefon bimbit.

---

## 4. SOP & SENARAI SEMAK WAJIB SEBELUM DEVELOPER BARU MEMBUAT PUSH KE VERCEL

Setiap pembangun baru yang mengambil alih sistem ini **WAJIB** melakukan senarai semak berikut sebelum menolak (`push`) sebarang perubahan kod:

1. **Ujian Pembacaan Penuh Tanpa Langkauan (`deduplicateSubmissionsList`):**
   - Pastikan setiap tarikan data gabungan memanggil `deduplicateSubmissionsList(...)` supaya tiada cawangan berganda atau jualan meningkat dua kali ganda (*sales double*).
2. **Ujian Isian Cawangan (`upsert`):**
   - Uji penghantaran jualan dari akaun cawangan (contoh cawangan `1004` / `1009`). Pastikan penghantaran berjaya di bawah 1 saat tanpa ralat konsol.
3. **Larangan Mengubah Kelas Wrapper Supabase (`SBCollectionRef`, `SBQuery`, `SBDocRef`):**
   - Kelas-kelas ini direka khusus untuk meniru kelakuan dan struktur fail projek asal. Sebarang pengubahan pada kaedah `where`, `get`, `set`, atau `onSnapshot` boleh meruntuhkan seluruh aplikasi.
4. **Aliran Penerbitan (Deployment Flow):**
   - Setelah ujian lokal selesai dan bebas ralat konsol, lakukan `git commit -m "..."` dan `git push origin main`. Vercel akan menerbitkan kemaskini rasmi ke `dashboard-operation.vercel.app` dalam masa ~30 saat.
