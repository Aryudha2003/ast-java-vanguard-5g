# East Java Vanguard — Admin & Viewer Edition

Hanya ada **2 role**:
- **Viewer** → diarahkan ke `/viewer`
- **Admin** → diarahkan ke `/admin`

## Perbedaan akses

Viewer:
- Dashboard
- 5G Sites
- Analytics
- Regional Report
- Network Performance
- Planning & Rollout
- Settings
- Tidak bisa Export
- Tidak bisa User Management
- Tidak bisa Audit Log
- URL admin diproteksi backend dan menghasilkan 403

Admin:
- Semua fitur Viewer
- Export
- User Management
- Audit Log
- Security overview API
- Admin-only navigation

## Keamanan yang ditambahkan
- server-side RBAC
- route-level authorization
- secure/HttpOnly/SameSite cookies
- Content-Security-Policy
- X-Frame-Options DENY
- no-store/no-cache
- audit logging (IP, user-agent, event)
- role-specific redirect after login
- demo login dapat dimatikan untuk production

## Jalankan
```bash
cd ~/Downloads/east_java_vanguard_roles_v2/east_java_vanguard_roles_v2
source ~/.venv/Scripts/activate
python -m pip install -r requirements.txt
python app.py
```

Buka `http://127.0.0.1:8080/login`.

Untuk production, set `ALLOW_DEMO_LOGIN=false` dan gunakan Google Workspace/SSO serta MFA.
