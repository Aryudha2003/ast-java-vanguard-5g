# East Java Vanguard — Actual Raw Data

Dashboard ini dibuat dari workbook **Progress and Plan Vanguard 2026.xlsx**, sheet `raw`.

Dataset yang diproses:
- Total site: 1,741
- On Air: 643
- Integrated - NY OA: 168
- Installation: 139
- NY Install: 791
- Nokia: 1,292
- Huawei: 449
- 5G Coverage: 1,133
- 5G Refarm: 608

## Jalankan di Windows Git Bash

```bash
cd ~/Downloads/east_java_vanguard_actual_data/east_java_vanguard_actual_data
source ~/.venv/Scripts/activate
python -m pip install -r requirements.txt
python app.py
```

Buka:
`http://127.0.0.1:8080/login`

Pilih **Demo Analyst** untuk preview.

## Production

Sebelum deploy:
1. `ALLOW_DEMO_LOGIN=false`
2. konfigurasi Google Workspace OAuth / Entra ID
3. pakai HTTPS
4. simpan secret di Secret Manager
5. batasi akun/domain melalui `ACCESS_RULES_JSON` / `ALLOWED_DOMAIN`
6. aktifkan MFA pada identity provider
7. simpan data pada database/API internal, bukan file yang bisa diakses publik
8. gunakan audit log / SIEM dan, bila perlu, IAP atau VPN

Catatan: dashboard ini memakai snapshot raw data dari file Excel yang diberikan. Untuk sinkronisasi real-time dengan Google Sheets/API internal, backend perlu dihubungkan ke sumber live tersebut.
