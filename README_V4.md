# East Java Vanguard v4 Functional

Versi ini mengganti halaman placeholder dengan halaman operasional.

Admin:
- Dashboard
- 5G Sites: map, filter, search, pagination, export CSV
- Analytics: status/vendor/program/regional analytics
- Regional Report: tabel dan ranking + export CSV
- Network Performance: deployment-health proxy (raw workbook tidak memiliki RF KPI)
- Planning & Rollout: backlog site
- User Management: add/update/remove access dengan CSRF protection
- Audit Log
- Settings

Viewer:
- seluruh halaman read-only operasional
- tidak melihat User Management/Audit Log
- tidak dapat export CSV
- request langsung ke endpoint admin/export mendapat 403

Keamanan:
- server-side RBAC
- CSRF protection untuk perubahan akses
- HttpOnly + SameSite cookies
- CSP / X-Frame-Options / no-store
- audit log
- user watermark

Run:
python app.py
URL: http://127.0.0.1:8080/login
