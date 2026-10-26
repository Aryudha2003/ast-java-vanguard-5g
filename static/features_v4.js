let DATA = null;
const page = document.body.dataset.page;
const role = document.body.dataset.role;
const byId = id => document.getElementById(id);
const fmt = n => (n ?? 0).toLocaleString("id-ID");
const pct = (v, t) => t ? ((v / t) * 100).toFixed(1) : "0.0";

function safe(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeClass(s) {
  return s === "On Air"
    ? "s-onair"
    : s === "Integrated - NY OA"
      ? "s-int"
      : s === "Installation"
        ? "s-inst"
        : "s-nyi";
}

// WIB Clock
function clock() {
  const d = new Date();
  const clockEl = byId("clock");
  if (!clockEl) return;

  const dateStr = d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const timeStr = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  clockEl.innerHTML = `${timeStr} WIB &bull; <small style="font-weight:500;opacity:0.8;">${dateStr}</small>`;
}
clock();
setInterval(clock, 1000);

// Metric Progress Bar Renderer
function barRows(obj, opts = {}) {
  const entries = Array.isArray(obj)
    ? obj
    : Object.entries(obj).map(([label, value]) => ({ label, value }));
  const max = Math.max(1, ...entries.map(x => +x.value || 0));

  return entries.map(x => {
    const val = +x.value || 0;
    const p = Math.min(100, Math.max(0, (val / max) * 100));
    const sub = x.sub || "";
    const displayVal = x.display ?? fmt(val);

    return `
      <div class="metric-row">
        <span class="metric-label" title="${escape(x.label)}">${safe(x.label)}</span>
        <div class="metric-track">
          <i style="width:${p.toFixed(1)}%;"></i>
        </div>
        <b class="metric-val">${displayVal}</b>
        ${sub ? `<small class="metric-sub">${sub}</small>` : ""}
      </div>
    `;
  }).join("");
}

async function getData() {
  const r = await fetch("/api/dashboard", { cache: "no-store" });
  if (!r.ok) throw new Error("Tidak dapat mengambil data dashboard");
  DATA = await r.json();

  if (page === "sites") initSites();
  if (page === "analytics") initAnalytics();
  if (page === "regional") initRegional();
  if (page === "network") initNetwork();
  if (page === "planning") initPlanning();
}

// ======================================================
// 1. 5G SITES EXPLORER
// ======================================================
let map = null;
let mapType = "maptiler";
let leafletMarkersLayer = null;
let sitePage = 1;
let siteMapReady = false;
const PAGE = 35;

const SITE_COLORS = {
  "On Air": "#10b981",
  "Integrated - NY OA": "#0284c7",
  "Installation": "#f59e0b",
  "NY Install": "#64748b"
};

function getMapTilerKey() {
  return document.querySelector('meta[name="maptiler-api-key"]')?.getAttribute("content")?.trim() || "";
}

function sitesToGeoJSON(sites) {
  return {
    type: "FeatureCollection",
    features: sites
      .filter(x => typeof x.lat === "number" && typeof x.lng === "number")
      .map(x => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [x.lng, x.lat]
        },
        properties: {
          site_id: x.site_id || "",
          site_name: x.site_name || "",
          city: x.city || "",
          kecamatan: x.kecamatan || "",
          status: x.status || "",
          vendor: x.vendor || "",
          program: x.program || "",
          on_air_date: x.on_air_date || "",
          integration_date: x.integration_date || ""
        }
      }))
  };
}

function initSites() {
  // Populate City filter
  const citySelect = byId("fCity");
  if (citySelect && DATA.sites) {
    const cities = [...new Set(DATA.sites.map(s => s.city).filter(Boolean))].sort();
    cities.forEach(c => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      citySelect.appendChild(o);
    });
  }

  // Try MapTiler first, fallback to Leaflet
  const key = getMapTilerKey();
  if (key && typeof maptilersdk !== "undefined") {
    try {
      maptilersdk.config.apiKey = key;
      map = new maptilersdk.Map({
        container: "sitesMap",
        style: maptilersdk.MapStyle.STREETS,
        center: [112.55, -7.50],
        zoom: 8.2,
        pitch: 42,
        bearing: -6,
        antialias: true
      });

      map.addControl(new maptilersdk.NavigationControl({ visualizePitch: true }), "top-left");

      map.on("load", () => {
        siteMapReady = true;
        mapType = "maptiler";
        setupMapTilerLayers();
      });

      map.on("error", () => {
        setupLeafletFallback();
      });
    } catch (e) {
      console.warn("MapTiler init error, using Leaflet:", e);
      setupLeafletFallback();
    }
  } else {
    setupLeafletFallback();
  }

  // Filter Events
  ["fCity", "fStatus", "fVendor"].forEach(id => {
    const el = byId(id);
    if (el) {
      el.addEventListener("change", () => {
        sitePage = 1;
        renderSites();
      });
    }
  });

  // Search input
  const search = byId("siteSearch");
  if (search) {
    search.addEventListener("input", () => {
      sitePage = 1;
      renderSites();
    });
    search.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusSiteBySearch();
      }
    });
  }

  // Pagination
  const prev = byId("sitePrev");
  if (prev) {
    prev.addEventListener("click", () => {
      sitePage = Math.max(1, sitePage - 1);
      renderSites();
    });
  }

  const next = byId("siteNext");
  if (next) {
    next.addEventListener("click", () => {
      const sites = siteFiltered();
      const pages = Math.ceil(sites.length / PAGE);
      if (sitePage < pages) {
        sitePage++;
        renderSites();
      }
    });
  }

  // Initial render
  renderSites();
}

function setupLeafletFallback() {
  if (typeof L === "undefined") return;
  const container = byId("sitesMap");
  if (!container) return;
  container.innerHTML = "";

  map = L.map("sitesMap", {
    center: [-7.50, 112.55],
    zoom: 8
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; CARTO &copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  leafletMarkersLayer = L.layerGroup().addTo(map);
  siteMapReady = true;
  mapType = "leaflet";
  renderSitesMap(siteFiltered());
}

function setupMapTilerLayers() {
  if (!map || mapType !== "maptiler") return;

  map.addSource("vanguard-sites", {
    type: "geojson",
    data: sitesToGeoJSON(DATA.sites),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 46
  });

  map.addLayer({
    id: "site-clusters",
    type: "circle",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#10b981", 30, "#0284c7", 100, "#f59e0b", 300, "#ef4444"
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18, 30, 24, 100, 30, 300, 36
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "site-cluster-count",
    type: "symbol",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 13
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "site-points",
    type: "circle",
    source: "vanguard-sites",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "status"],
        "On Air", SITE_COLORS["On Air"],
        "Integrated - NY OA", SITE_COLORS["Integrated - NY OA"],
        "Installation", SITE_COLORS["Installation"],
        "NY Install", SITE_COLORS["NY Install"],
        "#64748b"
      ],
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.on("click", "site-clusters", async e => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["site-clusters"] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("vanguard-sites");
    const zoom = await source.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom, duration: 600 });
  });

  map.on("click", "site-points", e => {
    if (!e.features?.length) return;
    const f = e.features[0];
    const p = f.properties;
    showSitesPopup(f.geometry.coordinates, p);
  });

  ["site-clusters", "site-points"].forEach(layerId => {
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
  });
}

function showSitesPopup(coords, p) {
  const html = `
    <div class="site-popup-card">
      <div class="popup-top">
        <span class="popup-badge ${badgeClass(p.status)}">${safe(p.status || "-")}</span>
        <span class="popup-vendor ${p.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${safe(p.vendor || "-")}</span>
      </div>
      <div class="popup-site-id">${safe(p.site_id)}</div>
      <div class="popup-site-name">${safe(p.site_name)}</div>
      <div class="popup-grid">
        <div><span>Wilayah:</span><b>${safe(p.city)}</b></div>
        <div><span>Kecamatan:</span><b>${safe(p.kecamatan || "-")}</b></div>
        <div><span>Program:</span><b>${safe(p.program || "-")}</b></div>
        <div><span>On Air:</span><b>${safe(p.on_air_date || "-")}</b></div>
      </div>
    </div>
  `;

  if (mapType === "maptiler" && map) {
    new maptilersdk.Popup({ offset: 12, closeButton: true, maxWidth: "290px" })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);
  } else if (mapType === "leaflet" && map) {
    L.popup({ maxWidth: 290 })
      .setLatLng([coords[1], coords[0]])
      .setContent(html)
      .openOn(map);
  }
}

function siteFiltered() {
  if (!DATA || !DATA.sites) return [];
  const city = byId("fCity")?.value || "all";
  const status = byId("fStatus")?.value || "all";
  const vendor = byId("fVendor")?.value || "all";
  const q = (byId("siteSearch")?.value || "").trim().toLowerCase();

  return DATA.sites.filter(x => {
    if (city !== "all" && x.city !== city) return false;
    if (status !== "all" && x.status !== status) return false;
    if (vendor !== "all" && x.vendor !== vendor) return false;
    if (q) {
      const match = [x.site_id, x.site_name, x.city, x.kecamatan]
        .some(v => String(v || "").toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}

function renderSites() {
  const sites = siteFiltered();
  const counts = {};
  sites.forEach(x => {
    counts[x.status] = (counts[x.status] || 0) + 1;
  });

  const totalEl = byId("sitesTotal");
  const onAirEl = byId("sitesOnAir");
  const onAirPctEl = byId("sitesOnAirPct");
  const intEl = byId("sitesInt");
  const progEl = byId("sitesProgress");

  if (totalEl) totalEl.textContent = fmt(sites.length);
  if (onAirEl) onAirEl.textContent = fmt(counts["On Air"] || 0);
  if (onAirPctEl) onAirPctEl.textContent = `${pct(counts["On Air"] || 0, sites.length)}% dari filter`;
  if (intEl) intEl.textContent = fmt(counts["Integrated - NY OA"] || 0);
  if (progEl) progEl.textContent = fmt((counts["Installation"] || 0) + (counts["NY Install"] || 0));

  renderSitesMap(sites);

  // Table pagination
  const pages = Math.max(1, Math.ceil(sites.length / PAGE));
  sitePage = Math.min(sitePage, pages);
  const start = (sitePage - 1) * PAGE;
  const slice = sites.slice(start, start + PAGE);

  const tbody = byId("sitesBody");
  if (tbody) {
    if (!sites.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-state" style="text-align:center;padding:30px;">Tidak ada site yang cocok dengan filter.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(x => `
        <tr class="site-row-clickable" onclick="handleFeatureRowClick('${safe(x.site_id)}')">
          <td><span class="mono-badge"><b>${safe(x.site_id)}</b></span></td>
          <td><b>${safe(x.site_name)}</b></td>
          <td>${safe(x.city)}</td>
          <td>${safe(x.kecamatan)}</td>
          <td><span class="status-pill ${badgeClass(x.status)}">${safe(x.status)}</span></td>
          <td><span class="vendor-tag ${x.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${safe(x.vendor)}</span></td>
          <td><span class="program-tag ${x.program === '5G Coverage' ? 'tag-coverage' : 'tag-refarm'}">${safe(x.program)}</span></td>
          <td>${safe(x.integration_date || "-")}</td>
          <td>${safe(x.on_air_date || "-")}</td>
        </tr>
      `).join("");
    }
  }

  const pageInfo = byId("sitePage");
  const resultCount = byId("sitesResultCount");
  const prevBtn = byId("sitePrev");
  const nextBtn = byId("siteNext");

  if (pageInfo) pageInfo.textContent = `Halaman ${sitePage} dari ${pages}`;
  if (resultCount) {
    const end = Math.min(start + PAGE, sites.length);
    resultCount.innerHTML = `Menampilkan <b>${start + 1}–${end}</b> dari <b>${fmt(sites.length)}</b> site 5G`;
  }
  if (prevBtn) prevBtn.disabled = sitePage <= 1;
  if (nextBtn) nextBtn.disabled = sitePage >= pages;
}

function renderSitesMap(sites) {
  if (!siteMapReady || !map) return;

  if (mapType === "maptiler") {
    const source = map.getSource("vanguard-sites");
    if (source) source.setData(sitesToGeoJSON(sites));
  } else if (mapType === "leaflet" && leafletMarkersLayer) {
    leafletMarkersLayer.clearLayers();
    sites.forEach(s => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") return;
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 6,
        fillColor: SITE_COLORS[s.status] || "#64748b",
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.9
      });
      marker.bindPopup(`
        <div class="site-popup-card">
          <div class="popup-top">
            <span class="popup-badge ${badgeClass(s.status)}">${safe(s.status || "-")}</span>
            <span class="popup-vendor ${s.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${safe(s.vendor || "-")}</span>
          </div>
          <div class="popup-site-id">${safe(s.site_id)}</div>
          <div class="popup-site-name">${safe(s.site_name)}</div>
          <div class="popup-grid">
            <div><span>Wilayah:</span><b>${safe(s.city)}</b></div>
            <div><span>Kecamatan:</span><b>${safe(s.kecamatan || "-")}</b></div>
            <div><span>Program:</span><b>${safe(s.program || "-")}</b></div>
            <div><span>On Air:</span><b>${safe(s.on_air_date || "-")}</b></div>
          </div>
        </div>
      `);
      leafletMarkersLayer.addLayer(marker);
    });
  }
}

window.handleFeatureRowClick = function(siteId) {
  if (!DATA || !DATA.sites) return;
  const site = DATA.sites.find(s => s.site_id === siteId);
  if (site && typeof site.lng === "number" && typeof site.lat === "number") {
    if (mapType === "maptiler" && map) {
      map.flyTo({ center: [site.lng, site.lat], zoom: 16, pitch: 50, duration: 800 });
      setTimeout(() => showSitesPopup([site.lng, site.lat], site), 700);
    } else if (mapType === "leaflet" && map) {
      map.setView([site.lat, site.lng], 15);
      showSitesPopup([site.lng, site.lat], site);
    }

    const mapCard = document.querySelector(".mapcard");
    if (mapCard) mapCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

function focusSiteBySearch() {
  const q = (byId("siteSearch")?.value || "").trim().toLowerCase();
  if (!q) return;

  const matches = siteFiltered();
  let site = matches.find(x => String(x.site_id || "").toLowerCase() === q) ||
             matches.find(x => String(x.site_name || "").toLowerCase() === q);

  if (!site && matches.length === 1) site = matches[0];
  if (!site) {
    alert("Site ID / Site Name tidak ditemukan dalam filter aktif.");
    return;
  }

  handleFeatureRowClick(site.site_id);
}

// ======================================================
// 2. ANALYTICS
// ======================================================
function initAnalytics() {
  const s = DATA.summary;
  const total = s.total_sites;
  const onair = s.status_counts["On Air"] || 0;

  byId("aTotal").textContent = fmt(total);
  byId("aRate").textContent = pct(onair, total) + "%";
  byId("aNokia").textContent = `${fmt(s.vendor_counts.Nokia)} (${pct(s.vendor_counts.Nokia, total)}%)`;
  byId("aHuawei").textContent = `${fmt(s.vendor_counts.Huawei)} (${pct(s.vendor_counts.Huawei, total)}%)`;

  byId("statusBars").innerHTML = barRows(s.status_counts);
  byId("vendorAnalytics").innerHTML = barRows(s.vendor_counts);
  byId("programAnalytics").innerHTML = barRows(s.program_counts);

  const top = [...DATA.cities]
    .sort((a, b) => b.on_air_rate - a.on_air_rate)
    .slice(0, 10)
    .map(x => ({
      label: x.city,
      value: x.on_air_rate,
      display: Number(x.on_air_rate).toFixed(1) + "%",
      sub: `${x.on_air} / ${x.total} sites`
    }));
  byId("topCityBars").innerHTML = barRows(top);
}

// ======================================================
// 3. REGIONAL REPORT
// ======================================================
function initRegional() {
  const search = byId("regionalSearch");
  if (search) search.addEventListener("input", renderRegional);
  renderRegional();
}

function renderRegional() {
  const q = (byId("regionalSearch")?.value || "").toLowerCase().trim();
  const rows = DATA.cities
    .filter(x => x.city.toLowerCase().includes(q))
    .sort((a, b) => (b.on_air_rate || 0) - (a.on_air_rate || 0));

  const tbody = byId("regionalBody");
  if (tbody) {
    tbody.innerHTML = rows.map(x => `
      <tr>
        <td><b>${safe(x.city)}</b></td>
        <td><b>${fmt(x.total)}</b></td>
        <td>${fmt(x.kecamatan)}</td>
        <td><span class="status-pill s-onair">${fmt(x.on_air)}</span></td>
        <td><span class="status-pill s-int">${fmt(x.integrated_ny_oa)}</span></td>
        <td><span class="status-pill s-inst">${fmt(x.installation)}</span></td>
        <td><span class="status-pill s-nyi">${fmt(x.ny_install)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${x.on_air_rate}%;background:#10b981;border-radius:4px;"></div>
            </div>
            <b>${Number(x.on_air_rate).toFixed(1)}%</b>
          </div>
        </td>
        <td><span class="vendor-tag vendor-nokia">${fmt(x.nokia)}</span></td>
        <td><span class="vendor-tag vendor-huawei">${fmt(x.huawei)}</span></td>
      </tr>
    `).join("");
  }

  const ranked = [...rows].map(x => ({
    label: x.city,
    value: x.on_air_rate,
    display: Number(x.on_air_rate).toFixed(1) + "%",
    sub: `${x.on_air} / ${x.total} on-air`
  }));

  const barsEl = byId("regionalBars");
  if (barsEl) barsEl.innerHTML = barRows(ranked);
}

// ======================================================
// 4. NETWORK PERFORMANCE
// ======================================================
function initNetwork() {
  const s = DATA.summary.status_counts;
  const total = DATA.summary.total_sites;
  const onair = s["On Air"] || 0;

  byId("nCompletion").textContent = pct(onair, total) + "%";
  byId("nIntegrated").textContent = fmt(s["Integrated - NY OA"] || 0);
  byId("nInstallation").textContent = fmt(s["Installation"] || 0);
  byId("nNotYet").textContent = fmt(s["NY Install"] || 0);

  const regionRanks = [...DATA.cities]
    .sort((a, b) => b.on_air_rate - a.on_air_rate)
    .map(x => ({
      label: x.city,
      value: x.on_air_rate,
      display: Number(x.on_air_rate).toFixed(1) + "%",
      sub: `${x.on_air} / ${x.total} sites`
    }));
  byId("networkRegionBars").innerHTML = barRows(regionRanks);

  const backlog = { Nokia: 0, Huawei: 0 };
  DATA.sites.filter(x => x.status !== "On Air").forEach(x => {
    backlog[x.vendor] = (backlog[x.vendor] || 0) + 1;
  });
  byId("networkBacklog").innerHTML = barRows(backlog);
}

// ======================================================
// 5. PLANNING & ROLLOUT
// ======================================================
function initPlanning() {
  const s = DATA.summary.status_counts;
  const backlogCount = DATA.summary.total_sites - (s["On Air"] || 0);

  byId("pBacklog").textContent = fmt(backlogCount);
  byId("pIntegrated").textContent = fmt(s["Integrated - NY OA"] || 0);
  byId("pInstallation").textContent = fmt(s["Installation"] || 0);
  byId("pNYInstall").textContent = fmt(s["NY Install"] || 0);

  byId("planStatus").addEventListener("change", renderPlanning);
  byId("planSearch").addEventListener("input", renderPlanning);
  renderPlanning();
}

function renderPlanning() {
  const s = byId("planStatus")?.value || "all";
  const q = (byId("planSearch")?.value || "").toLowerCase().trim();

  const filteredBacklog = DATA.sites.filter(x => {
    if (x.status === "On Air") return false;
    if (s !== "all" && x.status !== s) return false;
    if (q) {
      const match = [x.site_id, x.site_name, x.city, x.kecamatan]
        .some(v => (v || "").toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const tbody = byId("planningBody");
  if (tbody) {
    if (!filteredBacklog.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty-state" style="text-align:center;padding:28px;">Tidak ada backlog yang cocok dengan kriteria.</td></tr>`;
    } else {
      tbody.innerHTML = filteredBacklog.slice(0, 300).map(x => `
        <tr>
          <td><span class="mono-badge"><b>${safe(x.site_id)}</b></span></td>
          <td><b>${safe(x.site_name)}</b></td>
          <td>${safe(x.city)}</td>
          <td>${safe(x.kecamatan)}</td>
          <td><span class="status-pill ${badgeClass(x.status)}">${safe(x.status)}</span></td>
          <td><span class="vendor-tag ${x.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${safe(x.vendor)}</span></td>
          <td><span class="program-tag ${x.program === '5G Coverage' ? 'tag-coverage' : 'tag-refarm'}">${safe(x.program)}</span></td>
          <td>${safe(x.integration_date || "—")}</td>
        </tr>
      `).join("");
    }
  }
}

// Run loader
if (["sites", "analytics", "regional", "network", "planning"].includes(page)) {
  getData().catch(e => {
    console.error("Feature load error:", e);
  });
}
