from data_update_center_feature import register_update_center
from flask import request
from dotenv import load_dotenv
load_dotenv(override=True)

import os, json, csv, io, secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import (
    Flask, render_template, redirect, url_for, session, request,
    jsonify, abort, Response
)
from authlib.integrations.flask_client import OAuth

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "change-me-in-production")
app.permanent_session_lifetime = timedelta(minutes=int(os.getenv("SESSION_TIMEOUT_MINUTES", "30")))

_is_prod = os.getenv("FLASK_ENV") == "production"
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    # "Lax" blocks the session cookie on cross-site redirects from Google,
    # causing the OAuth state to vanish → MismatchingStateError.
    # Use "None" (with Secure=True in prod) so Google's redirect carries the cookie.
    SESSION_COOKIE_SAMESITE="None" if _is_prod else "Lax",
    SESSION_COOKIE_SECURE=_is_prod,
)

oauth = OAuth(app)
google = oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

VALID_ROLES = {"viewer", "admin"}

ALLOW_DEMO_LOGIN = (
    os.getenv("ALLOW_DEMO_LOGIN", "false").lower() == "true"
)

AUDIT_LOG = os.getenv(
    "AUDIT_LOG",
    "data/audit.log"
)

ACCESS_FILE = os.getenv(
    "ACCESS_FILE",
    "data/access_rules.json"
)


MAPTILER_API_KEY = os.getenv(
    "MAPTILER_API_KEY",
    ""
)
def ensure_access_file():
    if not os.path.exists(ACCESS_FILE):
        os.makedirs(os.path.dirname(ACCESS_FILE) or ".", exist_ok=True)
        env_rules = os.getenv("ACCESS_RULES_JSON", "").strip()
        rules = DEFAULT_ACCESS
        if env_rules:
            try:
                parsed = json.loads(env_rules)
                rules = {k.lower(): v for k, v in parsed.items() if v in VALID_ROLES}
            except Exception:
                pass
        with open(ACCESS_FILE, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2)

def load_access_rules():
    ensure_access_file()
    try:
        with open(ACCESS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return {k.lower(): v for k, v in data.items() if v in VALID_ROLES}
    except Exception:
        return DEFAULT_ACCESS.copy()

def save_access_rules(rules):
    os.makedirs(os.path.dirname(ACCESS_FILE) or ".", exist_ok=True)
    with open(ACCESS_FILE, "w", encoding="utf-8") as f:
        json.dump(rules, f, indent=2)

def role_for(email):
    return load_access_rules().get((email or "").strip().lower())

def csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]

app.jinja_env.globals["csrf_token"] = csrf_token

def verify_csrf():
    supplied = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    if not supplied or supplied != session.get("csrf_token"):
        audit("CSRF_REJECTED", request.path)
        abort(403)

def audit(event, extra=""):
    os.makedirs(os.path.dirname(AUDIT_LOG) or ".", exist_ok=True)
    user = session.get("user", {})
    row = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": event,
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "ua": request.headers.get("User-Agent", ""),
        "extra": str(extra)[:500],
    }
    with open(AUDIT_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = session.get("user")
        if not user or user.get("role") not in VALID_ROLES:
            session.clear()
            return redirect(url_for("login"))
        session.permanent = True
        return fn(*args, **kwargs)
    return wrapper

def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = session.get("user")
            if not user:
                return redirect(url_for("login"))
            if user.get("role") not in roles:
                audit("ROLE_ACCESS_DENIED", request.path)
                abort(403)
            return fn(*args, **kwargs)
        return wrapper
    return deco

@app.after_request
def security_headers(resp):

    resp.headers["X-Frame-Options"] = "DENY"

    resp.headers["X-Content-Type-Options"] = "nosniff"

    resp.headers["Referrer-Policy"] = "no-referrer"

    resp.headers["Cache-Control"] = (
        "no-store, no-cache, must-revalidate, private"
    )

    resp.headers["Pragma"] = "no-cache"

    resp.headers["Permissions-Policy"] = (
        "camera=(), "
        "microphone=(), "
        "geolocation=(), "
        "usb=(), "
        "payment=()"
    )


    # ==========================================
    # CSP
    # Leaflet/CARTO lama tetap diizinkan sementara
    # MapTiler SDK + API sudah ditambahkan.
    # ==========================================
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.maptiler.com https://fonts.googleapis.com; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://unpkg.com https://cdn.maptiler.com; "
        "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://api.maptiler.com https://*.maptiler.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://server.arcgisonline.com https://*.arcgisonline.com https://tiles.openfreemap.org https://*.openfreemap.org; "
        "connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org https://server.arcgisonline.com https://*.arcgisonline.com https://*.basemaps.cartocdn.com https://api.maptiler.com https://*.maptiler.com https://*.tile.openstreetmap.org; "
        "font-src 'self' data: https://tiles.openfreemap.org https://*.openfreemap.org https://api.maptiler.com https://*.maptiler.com https://fonts.gstatic.com; "
        "worker-src 'self' blob:; "
        "child-src 'self' blob:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )

    return resp
# ---------- Login / routing ----------
@app.route("/login")
def login():
    oauth_ready = bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))
    return render_template("login.html", oauth_ready=oauth_ready, demo_ready=ALLOW_DEMO_LOGIN)

@app.route("/demo-login/<role>")
def demo_login(role):
    if not ALLOW_DEMO_LOGIN or role not in VALID_ROLES:
        abort(403)
    session.clear()
    session["user"] = {
        "name": f"{role.title()} Demo",
        "email": f"{role}@company.com",
        "role": role,
        "demo": True,
    }
    csrf_token()
    audit("DEMO_LOGIN", role)
    return redirect(url_for("admin_home" if role == "admin" else "viewer_home"))

@app.route("/google-login")
def google_login():
    if not (os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET")):
        abort(503)

    mode = (request.args.get("mode") or "viewer").strip().lower()

    if mode not in {"admin", "viewer"}:
        abort(400)

    # Make session permanent so it persists across the OAuth redirect round-trip
    session.permanent = True
    session["login_mode"] = mode

    redirect_uri = url_for("auth_callback", _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route("/auth/callback")
def auth_callback():
    from authlib.integrations.base_client.errors import MismatchingStateError, OAuthError
    try:
        token = google.authorize_access_token()
    except MismatchingStateError:
        # State mismatch: session cookie was lost during Google redirect.
        # Redirect user back to login with a clear error message.
        return redirect(url_for("login") + "?error=state_mismatch")
    except OAuthError as e:
        return redirect(url_for("login") + f"?error=oauth_error")

    info = token.get("userinfo") or {}
    email = (info.get("email") or "").strip().lower()
    login_mode = session.pop("login_mode", "viewer")

    if login_mode == "admin":
        role = role_for(email)

        if role != "admin":
            session.clear()
            return render_template("denied.html", email=email), 403

        role = "admin"
    else:
        role = "viewer"
    session["user"] = {
        "name": info.get("name", email),
        "email": email,
        "role": role,
        "picture": info.get("picture", ""),
        "demo": False,
    }
    csrf_token()
    audit("LOGIN_OK")
    return redirect(url_for("admin_home" if role == "admin" else "viewer_home"))

@app.route("/logout")
def logout():
    audit("LOGOUT")
    session.clear()
    return redirect(url_for("login"))

@app.route("/")
@require_login
def root_router():
    return redirect(url_for("admin_home" if session["user"]["role"] == "admin" else "viewer_home"))

@app.route("/viewer")
@require_role("viewer")
def viewer_home():

    audit("VIEWER_HOME")

    return render_template(
        "dashboard.html",

        user=session["user"],

        page="dashboard",

        maptiler_api_key=MAPTILER_API_KEY
    )



@app.route("/admin")
@require_role("admin")
def admin_home():

    audit("ADMIN_HOME")

    return render_template(
        "dashboard.html",

        user=session["user"],

        page="dashboard",

        maptiler_api_key=MAPTILER_API_KEY
    )
# ---------- Functional pages ----------
def render_feature(page, title):

    return render_template(
        "feature_functional.html",

        user=session["user"],

        page=page,

        title=title,

        maptiler_api_key=MAPTILER_API_KEY
    )
@app.route("/5g-sites")
@require_login
@require_role("admin")
def sites_page():
    return render_feature("sites", "5G Sites")

@app.route("/analytics")
@require_login
@require_role("admin")
def analytics_page():
    return render_feature("analytics", "Analytics")

@app.route("/regional-report")
@require_login
@require_role("admin")
def regional_page():
    return render_feature("regional", "Regional Report")

@app.route("/network-performance")
@require_login
@require_role("admin")
def network_page():
    return render_feature("network", "Network Performance")

@app.route("/planning-rollout")
@require_login
@require_role("admin")
def planning_page():
    return render_feature("planning", "Planning & Rollout")

@app.route("/settings")
@require_login
@require_role("admin")
def settings_page():
    return render_feature("settings", "Settings")

# ---------- Admin only ----------
@app.route("/admin/user-management")
@require_role("admin")
def user_management():
    audit("USER_MANAGEMENT_VIEW")
    return render_template(
        "admin_users_v4.html",
        user=session["user"],
        page="users",
        access_rules=load_access_rules()
    )

@app.route("/admin/users/add", methods=["POST"])
@require_role("admin")
def user_add():
    verify_csrf()
    email = request.form.get("email", "").strip().lower()
    role = request.form.get("role", "").strip().lower()
    if "@" not in email or role not in VALID_ROLES:
        abort(400)
    rules = load_access_rules()
    rules[email] = role
    save_access_rules(rules)
    audit("USER_ACCESS_UPSERT", f"{email}:{role}")
    return redirect(url_for("user_management"))

@app.route("/admin/users/delete", methods=["POST"])
@require_role("admin")
def user_delete():
    verify_csrf()
    email = request.form.get("email", "").strip().lower()
    # prevent current admin locking itself out in local demo
    if email == session["user"].get("email"):
        audit("USER_DELETE_BLOCKED_SELF", email)
        abort(400)
    rules = load_access_rules()
    if email in rules:
        del rules[email]
        save_access_rules(rules)
        audit("USER_ACCESS_DELETE", email)
    return redirect(url_for("user_management"))

@app.route("/admin/audit-log")
@require_role("admin")
def audit_log_page():
    rows = []
    if os.path.exists(AUDIT_LOG):
        with open(AUDIT_LOG, encoding="utf-8") as f:
            for line in f.readlines()[-500:]:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass
        rows.reverse()
    return render_template("audit.html", user=session["user"], page="audit", rows=rows)

# ---------- Data APIs ----------
@app.route("/api/dashboard")
@require_login
def dashboard_data():
    with open("data/vanguard.json", encoding="utf-8") as f:
        data = json.load(f)
    audit("READ_DASHBOARD_DATA")
    return jsonify(data)

@app.route("/api/export/<dataset>")
@require_role("admin")
def export_dataset(dataset):
    with open("data/vanguard.json", encoding="utf-8") as f:
        data = json.load(f)

    output = io.StringIO()
    if dataset == "sites":
        fields = [
            "site_id","site_name","city","kecamatan","program","status",
            "vendor","integration_date","on_air_date","lat","lng"
        ]
        rows = data["sites"]
        filename = "vanguard_sites.csv"
    elif dataset == "regional":
        fields = [
            "city","total","kecamatan","on_air","integrated_ny_oa",
            "installation","ny_install","on_air_rate","nokia","huawei"
        ]
        rows = data["cities"]
        filename = "vanguard_regional.csv"
    else:
        abort(404)

    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    audit("EXPORT_DATA", dataset)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.route("/api/admin/security-overview")
@require_role("admin")
def security_overview():
    return jsonify({
        "roles": ["admin", "viewer"],
        "session_timeout_minutes": int(os.getenv("SESSION_TIMEOUT_MINUTES", "30")),
        "demo_login_enabled": ALLOW_DEMO_LOGIN,
        "authorized_accounts": len(load_access_rules()),
        "protections": [
            "server-side RBAC",
            "CSRF protection on admin writes",
            "admin-only export",
            "audit logging",
            "HttpOnly + SameSite cookies",
            "CSP + anti-framing headers",
            "no-store cache"
        ]
    })

@app.errorhandler(403)
def forbidden(_):
    return render_template("denied.html", email=(session.get("user") or {}).get("email", "")), 403

register_update_center(
    app,
    require_role,
    verify_csrf,
    csrf_token,
    audit,
)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")), debug=True)
