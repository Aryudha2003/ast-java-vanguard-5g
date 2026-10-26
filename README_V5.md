# East Java Vanguard v5 Secure

Versi ini menghapus akses demo dari login normal dan memakai **explicit whitelist**.

## Role
Hanya dua role:
- `admin`
- `viewer`

Tidak ada fallback domain otomatis. Email yang tidak ada di whitelist akan ditolak.

## Contoh whitelist
Edit:
`data/access_rules.json`

```json
{
  "admin1@company.com": "admin",
  "admin2@company.com": "admin",
  "viewer1@company.com": "viewer",
  "viewer2@company.com": "viewer"
}
```

## Alur login
1. User klik **Masuk dengan Google Workspace**
2. Google mengautentikasi akun
3. Backend membaca email
4. Backend mencari email pada `data/access_rules.json`
5. Jika `admin` -> redirect `/admin`
6. Jika `viewer` -> redirect `/viewer`
7. Jika tidak terdaftar -> Access Denied

## Proteksi Admin
Viewer tidak bisa membuka:
- `/admin`
- `/admin/user-management`
- `/admin/audit-log`
- `/api/export/sites`
- `/api/export/regional`
- `/api/admin/security-overview`

Proteksi dilakukan **di backend**, bukan hanya menyembunyikan menu.

## Konfigurasi Google OAuth
Buat OAuth 2.0 Web Client di Google Cloud Console.

Authorized redirect URI lokal:
`http://127.0.0.1:8080/auth/callback`

Set environment:
```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export SECRET_KEY="random-long-secret"
export ALLOW_DEMO_LOGIN=false
python app.py
```

Di Windows Git Bash bisa juga memakai file `.env` melalui tooling tambahan, tetapi project ini membaca environment variable secara langsung.

## Production
- `ALLOW_DEMO_LOGIN=false`
- Google Workspace / Entra ID SSO
- MFA wajib di identity provider
- HTTPS
- reverse proxy / Cloud Run / internal server
- Secret Manager
- audit log ke SIEM
- IAP/VPN untuk data sensitif
- jangan expose `data/access_rules.json` sebagai static file
- jangan hardcode password di source code

## Catatan
Untuk benar-benar hanya dua Admin, cukup sisakan dua email dengan role `admin` di `data/access_rules.json`. Viewer dapat ditambah sesuai kebutuhan.
