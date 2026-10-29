Data Pyranometer IESR — cara pakai
1. Ekstrak folder, lalu buka index.html di browser (Chrome/Edge/Firefox). Tidak perlu server/internet.
2. Koordinat sensor: isi latitude & longitude di js/config.js.
3. Ganti data: jalankan  python build_data.py Kevin_Toba_2023.xlsx  (butuh pandas, openpyxl) untuk membuat ulang js/data.js.

Struktur: index.html · css/style.css · js/app.js · js/config.js · js/data.js · images/logo.png

Logo: taruh file logo perusahaan di folder images/ dengan nama logo.png (menggantikan file yang ada). Jika file tidak ada, logo disembunyikan otomatis.
Font: Raleway (disertakan di folder fonts/, tetap jalan offline).
