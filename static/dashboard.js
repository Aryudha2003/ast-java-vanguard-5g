let DATA = null;
let currentPage = 1;
const PAGE_SIZE = 35;

const colors = {
  "On Air": "#10b981",
  "Integrated - NY OA": "#0284c7",
  "Installation": "#f59e0b",
  "NY Install": "#64748b"
};

let map = null;
let mapType = "maplibre"; // "maplibre" (3D) or "leaflet" (2D fallback)
let leafletMarkersLayer = null;
let mapReady = false;
let is3D = true;

// ======================================================
// HELPERS
// ======================================================

function pct(v, t) {
  return t ? ((v / t) * 100).toFixed(1) : "0.0";
}

function escapeHTML(value) {
  return String(value || "")
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
  const clockEl = document.getElementById("clock");
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

// Session Countdown Timer (30 minutes)
let secs = 1800;
setInterval(() => {
  secs = Math.max(0, secs - 1);
  const timeFormatted =
    String(Math.floor(secs / 60)).padStart(2, "0") +
    ":" +
    String(secs % 60).padStart(2, "0");

  const timerEl = document.getElementById("sessionTimer");
  const bottomTimerEl = document.getElementById("sessionTimerBottom");

  if (timerEl) {
    timerEl.textContent = timeFormatted;
    if (secs < 300) {
      timerEl.parentElement.classList.add("timer-urgent");
    }
  }

  if (bottomTimerEl) {
    bottomTimerEl.textContent = timeFormatted;
  }
}, 1000);

// ======================================================
// INITIALIZATION
// ======================================================

async function init() {
  try {
    const r = await fetch("/api/dashboard", { cache: "no-store" });
    if (!r.ok) {
      throw new Error("Gagal mengambil data dashboard dari server (HTTP " + r.status + ")");
    }

    DATA = await r.json();

    // Populate City Filter Dropdown
    const citySelect = document.getElementById("cityFilter");
    if (DATA.summary && DATA.summary.city_counts && citySelect) {
      // Sort cities by site count descending or alphabetical
      const sortedCities = Object.keys(DATA.summary.city_counts).sort();
      sortedCities.forEach(c => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = `${c} (${DATA.summary.city_counts[c]})`;
        citySelect.appendChild(o);
      });
    }

    // Initialize 3D Vector Map (MapLibre with 3D Buildings)
    try {
      await initMap();
    } catch (mapErr) {
      console.warn("MapLibre 3D init failed, switching to Leaflet fallback:", mapErr);
      initLeafletFallback();
    }

    // Attach 3D Toggle Button
    const toggle3dBtn = document.getElementById("toggle3dBtn");
    if (toggle3dBtn) {
      toggle3dBtn.addEventListener("click", () => {
        is3D = !is3D;
        if (mapType === "maplibre" && map) {
          if (is3D) {
            // Jika masih di zoom level provinsi, arahkan kamera ke area metropolitan (Surabaya) agar gedung 3D langsung terlihat
            if (map.getZoom() < 13) {
              map.flyTo({
                center: [112.748, -7.265],
                zoom: 15.2,
                pitch: 55,
                bearing: -15,
                duration: 1200
              });
            } else {
              map.easeTo({ pitch: 52, bearing: -12, duration: 700 });
            }
            toggle3dBtn.classList.add("active");
            toggle3dBtn.innerHTML = "🏢 3D Bangunan";
            try {
              if (map.getLayer("building-3d")) {
                map.setLayoutProperty("building-3d", "visibility", "visible");
              }
            } catch (e) {}
          } else {
            map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
            toggle3dBtn.classList.remove("active");
            toggle3dBtn.innerHTML = "🗺️ 2D Datar";
            try {
              if (map.getLayer("building-3d")) {
                map.setLayoutProperty("building-3d", "visibility", "none");
              }
            } catch (e) {}
          }
        }
      });
    }

    // Initial render
    render();

    // Attach row clear button
    const clearBtn = document.getElementById("clearSearchBtn");
    const searchInput = document.getElementById("searchBox");
    if (clearBtn && searchInput) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.style.display = "none";
        render();
      });

      searchInput.addEventListener("input", () => {
        clearBtn.style.display = searchInput.value ? "flex" : "none";
      });
    }

    // Populate Site Search Suggestions Datalist
    populateSiteSuggestions();

    // Attach Map Site Search & Zoom Button
    const siteSearchInput = document.getElementById("siteSearchInput");
    const siteSearchBtn = document.getElementById("siteSearchBtn");

    if (siteSearchInput) {
      siteSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          zoomToSiteLocation(siteSearchInput.value);
        }
      });

      siteSearchInput.addEventListener("change", () => {
        if (siteSearchInput.value) {
          zoomToSiteLocation(siteSearchInput.value);
        }
      });
    }

    if (siteSearchBtn) {
      siteSearchBtn.addEventListener("click", () => {
        if (siteSearchInput && siteSearchInput.value) {
          zoomToSiteLocation(siteSearchInput.value);
        } else {
          alert("Ketik atau pilih Site ID terlebih dahulu pada kotak pencarian.");
        }
      });
    }

    // Attach Close Floating Site Detail Card
    const closeDetailBtn = document.getElementById("closeSiteDetailCardBtn");
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener("click", () => {
        const card = document.getElementById("selectedSiteDetailCard");
        if (card) card.style.display = "none";
      });
    }

    // Attach Reset Map Filter Button
    const resetBtn = document.getElementById("resetMapFilterBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const cf = document.getElementById("cityFilter");
        const sf = document.getElementById("statusFilter");
        const vf = document.getElementById("vendorFilter");
        const pf = document.getElementById("programFilter");
        const sb = document.getElementById("searchBox");
        const ssi = document.getElementById("siteSearchInput");

        if (cf) cf.value = "all";
        if (sf) sf.value = "all";
        if (vf) vf.value = "all";
        if (pf) pf.value = "all";
        if (sb) {
          sb.value = "";
          if (clearBtn) clearBtn.style.display = "none";
        }
        if (ssi) ssi.value = "";

        const card = document.getElementById("selectedSiteDetailCard");
        if (card) card.style.display = "none";

        render();
        resetMapView();
      });
    }

  } catch (e) {
    console.error("Dashboard init error:", e);
    const container = document.querySelector(".content");
    if (container) {
      const errBox = document.createElement("div");
      errBox.className = "card card-error-banner";
      errBox.innerHTML = `
        <div style="padding:24px;text-align:center;">
          <h2 style="color:#ef4444;margin:0 0 8px;">Gagal Memuat Dashboard</h2>
          <p style="color:#64748b;margin:0 0 16px;">${escapeHTML(e.message || e)}</p>
          <button onclick="location.reload()" class="btn-action-primary" style="margin:0 auto;">Coba Muat Ulang</button>
        </div>
      `;
      container.prepend(errBox);
    }
  }
}

// ======================================================
// MAPLIBRE 3D VECTOR MAP INITIALIZATION (WITH 3D BUILDINGS)
// ======================================================

async function initMap() {
  if (typeof maplibregl === "undefined") {
    throw new Error("Pustaka MapLibre GL JS tidak tersedia.");
  }

  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;
  mapContainer.innerHTML = "";

  // OpenFreeMap Liberty: Peta jalan lengkap + Bangunan 3D resmi (Bebas API Key & 100% Gratis)
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [112.55, -7.50],
    zoom: 8.4,
    pitch: 45, // Tampilan 3D perspektif agar bangunan 3D terlihat nyata
    bearing: -8,
    antialias: true
  });

  // Navigasi 3D (Zoom, Kompas, dan Pitch Tilt)
  map.addControl(new maplibregl.NavigationControl({
    visualizePitch: true,
    showCompass: true,
    showZoom: true
  }), "top-left");

  map.addControl(new maplibregl.FullscreenControl(), "top-left");

  // Skala metrik (KM)
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  await new Promise((resolve) => {
    map.once("load", () => {
      // Tingkatkan pencahayaan dan warna bangunan 3D
      try {
        if (map.getLayer("building-3d")) {
          map.setLayerZoomRange("building-3d", 12.5, 22);
          map.setPaintProperty("building-3d", "fill-extrusion-color", [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 10],
            0, "#e2e8f0",
            15, "#cbd5e1",
            40, "#94a3b8",
            80, "#64748b"
          ]);
          map.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.9);
          map.setPaintProperty("building-3d", "fill-extrusion-vertical-gradient", true);
        }
      } catch (err) {
        console.warn("3D building styling notice:", err);
      }
      resolve();
    });

    map.once("error", (e) => {
      console.warn("MapLibre load notice:", e);
      resolve();
    });
  });

  mapReady = true;
  mapType = "maplibre";

  addSiteSourceAndLayers();
}

// Fallback Leaflet jika WebGL tidak didukung
function initLeafletFallback() {
  if (typeof L === "undefined") return;
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;
  mapContainer.innerHTML = "";

  map = L.map("map", {
    center: [-7.50, 112.55],
    zoom: 8.4,
    zoomControl: true,
    preferCanvas: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(map);

  leafletMarkersLayer = L.layerGroup().addTo(map);
  mapReady = true;
  mapType = "leaflet";
}

function add3DBuildings() {
  // Sudah terintegrasi otomatis dalam MapLibre style OpenFreeMap (building-3d)
}

function addSiteSourceAndLayers() {
  if (!mapReady || mapType !== "maplibre") return;

  // Sumber GeoJSON dengan clustering
  map.addSource("vanguard-sites", {
    type: "geojson",
    data: siteGeoJSON([]),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 45
  });

  // Layer Cluster Lingkaran
  map.addLayer({
    id: "site-clusters",
    type: "circle",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#10b981",
        30, "#0284c7",
        100, "#f59e0b",
        300, "#ef4444"
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18,
        30, 24,
        100, 30,
        300, 36
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92
    }
  });

  // Label Jumlah Cluster
  map.addLayer({
    id: "site-cluster-count",
    type: "symbol",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 13,
      "text-font": ["literal", ["Noto Sans Bold", "Open Sans Bold", "Arial Unicode MS Bold"]]
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  // Titik Site Individual
  map.addLayer({
    id: "site-points",
    type: "circle",
    source: "vanguard-sites",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "status"],
        "On Air", colors["On Air"],
        "Integrated - NY OA", colors["Integrated - NY OA"],
        "Installation", colors["Installation"],
        "NY Install", colors["NY Install"],
        "#64748b"
      ],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        8, 4,
        12, 6,
        16, 9
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95
    }
  });

  // Klik Cluster untuk Zoom
  map.on("click", "site-clusters", async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["site-clusters"] });
    if (!features.length) return;

    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("vanguard-sites");
    const zoom = await source.getClusterExpansionZoom(clusterId);

    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom: zoom,
      duration: 600
    });
  });

  // Klik Titik Site untuk Popup Detail
  map.on("click", "site-points", (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    showMapPopup(f.geometry.coordinates, f.properties);
  });

  // Kursor pointer saat hover
  ["site-clusters", "site-points"].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

function siteGeoJSON(sites) {
  return {
    type: "FeatureCollection",
    features: sites
      .filter(s => typeof s.lat === "number" && typeof s.lng === "number")
      .map(s => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.lng, s.lat]
        },
        properties: {
          site_id: s.site_id || "",
          site_name: s.site_name || "",
          city: s.city || "",
          kecamatan: s.kecamatan || "",
          status: s.status || "",
          vendor: s.vendor || "",
          program: s.program || "",
          integration_date: s.integration_date || "",
          on_air_date: s.on_air_date || ""
        }
      }))
  };
}

// ======================================================
// MAP SITE LAYERS (MAPTILER)
// ======================================================

function addSiteSourceAndLayers() {
  if (!mapReady || mapType !== "maptiler") return;

  map.addSource("vanguard-sites", {
    type: "geojson",
    data: siteGeoJSON([]),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 45
  });

  // Cluster Circles
  map.addLayer({
    id: "site-clusters",
    type: "circle",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#10b981", // < 30 sites: green
        30, "#0284c7", // 30-100: blue
        100, "#f59e0b", // 100-300: amber
        300, "#ef4444" // > 300: red
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18,
        30, 24,
        100, 30,
        300, 36
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92
    }
  });

  // Cluster Count Labels
  map.addLayer({
    id: "site-cluster-count",
    type: "symbol",
    source: "vanguard-sites",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 13,
      "text-font": ["literal", ["Open Sans Bold", "Arial Unicode MS Bold"]]
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  // Individual Site Points
  map.addLayer({
    id: "site-points",
    type: "circle",
    source: "vanguard-sites",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "status"],
        "On Air", colors["On Air"],
        "Integrated - NY OA", colors["Integrated - NY OA"],
        "Installation", colors["Installation"],
        "NY Install", colors["NY Install"],
        "#64748b"
      ],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        8, 4,
        12, 6,
        16, 9
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95
    }
  });

  // Cluster Click: Zoom to expand
  map.on("click", "site-clusters", async e => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["site-clusters"] });
    if (!features.length) return;

    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("vanguard-sites");
    const zoom = await source.getClusterExpansionZoom(clusterId);

    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom: zoom,
      duration: 600
    });
  });

  // Site Point Click: Rich Popup
  map.on("click", "site-points", e => {
    if (!e.features?.length) return;
    const f = e.features[0];
    const p = f.properties;

    showMapPopup(f.geometry.coordinates, p);
  });

  // Mouse Cursor styling
  ["site-clusters", "site-points"].forEach(layerId => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

function showMapPopup(coordinates, p) {
  const popupHTML = `
    <div class="site-popup-card">
      <div class="popup-top">
        <span class="popup-badge ${badgeClass(p.status)}">${escapeHTML(p.status || "-")}</span>
        <span class="popup-vendor ${p.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${escapeHTML(p.vendor || "-")}</span>
      </div>
      <div class="detail-field-group highlight-box" style="margin-bottom:8px;">
        <span class="detail-field-title">SITE ID</span>
        <div class="detail-field-id">${escapeHTML(p.site_id || "-")}</div>
      </div>
      <div class="detail-field-group" style="margin-bottom:8px;">
        <span class="detail-field-title">SITE NAME</span>
        <div class="detail-field-name">${escapeHTML(p.site_name || "-")}</div>
      </div>
      <div class="detail-field-split" style="margin-top:6px;">
        <div>
          <span class="detail-field-title">KABUPATEN / KOTA</span>
          <div class="detail-field-val">${escapeHTML(p.city || "-")}</div>
        </div>
        <div>
          <span class="detail-field-title">KECAMATAN</span>
          <div class="detail-field-val">${escapeHTML(p.kecamatan || "-")}</div>
        </div>
      </div>
      <div class="popup-grid" style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;">
        <div><span>Program:</span><b>${escapeHTML(p.program || "-")}</b></div>
        <div><span>On Air:</span><b>${escapeHTML(p.on_air_date || "-")}</b></div>
      </div>
    </div>
  `;

  if (mapType === "maplibre" && map) {
    new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: "310px", className: "vanguard-maplibre-popup" })
      .setLngLat(coordinates)
      .setHTML(popupHTML)
      .addTo(map);
  } else if (mapType === "leaflet" && map) {
    L.popup({ maxWidth: 310, className: "vanguard-leaflet-popup" })
      .setLatLng([coordinates[1], coordinates[0]])
      .setContent(popupHTML)
      .openOn(map);
  }

  updateFloatingSiteCard(p);
}

// Update Floating Selected Site Detail Card
function updateFloatingSiteCard(p) {
  const card = document.getElementById("selectedSiteDetailCard");
  if (!card || !p) return;

  const idEl = document.getElementById("cardSiteId");
  const nameEl = document.getElementById("cardSiteName");
  const cityEl = document.getElementById("cardSiteCity");
  const kecEl = document.getElementById("cardSiteKec");
  const statusEl = document.getElementById("cardStatusBadge");
  const vendorEl = document.getElementById("cardVendorBadge");

  if (idEl) idEl.textContent = p.site_id || "-";
  if (nameEl) nameEl.textContent = p.site_name || "-";
  if (cityEl) cityEl.textContent = p.city || "-";
  if (kecEl) kecEl.textContent = p.kecamatan || "-";

  if (statusEl) {
    statusEl.textContent = p.status || "-";
    statusEl.className = `site-status-badge ${badgeClass(p.status)}`;
  }
  if (vendorEl) {
    vendorEl.textContent = p.vendor || "-";
    vendorEl.className = `site-vendor-badge ${p.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}`;
  }

  card.style.display = "block";
}

// Populate Site Search Suggestions Datalist
function populateSiteSuggestions() {
  const datalist = document.getElementById("siteSearchSuggestions");
  if (!datalist || !DATA || !DATA.sites) return;
  datalist.innerHTML = "";

  DATA.sites.slice(0, 1000).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.site_id;
    opt.textContent = `${s.site_id} — ${s.site_name} (${s.city}, ${s.kecamatan || ""})`;
    datalist.appendChild(opt);
  });
}

// ZOOM DIRECTLY TO SITE LOCATION
function zoomToSiteLocation(query) {
  if (!DATA || !DATA.sites || !query) return false;
  const q = String(query).trim().toLowerCase();
  if (!q) return false;

  // Exact match first, then prefix, then contains
  let site = DATA.sites.find(s => String(s.site_id || "").toLowerCase() === q);
  if (!site) {
    site = DATA.sites.find(s => String(s.site_id || "").toLowerCase().startsWith(q));
  }
  if (!site) {
    site = DATA.sites.find(s => String(s.site_name || "").toLowerCase() === q);
  }
  if (!site) {
    site = DATA.sites.find(s => String(s.site_id || "").toLowerCase().includes(q) || String(s.site_name || "").toLowerCase().includes(q));
  }

  if (!site) {
    alert(`Site "${query}" tidak ditemukan.`);
    return false;
  }

  if (typeof site.lng !== "number" || typeof site.lat !== "number") {
    alert(`Koordinat lokasi geospasial untuk site ${site.site_id} (${site.site_name}) belum tersedia.`);
    return false;
  }

  // Smooth scroll to map if not visible
  const mapCard = document.querySelector(".mapcard");
  if (mapCard) {
    mapCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Fly directly to site in 3D
  flyToSite(site);

  return true;
}

// ======================================================
// FILTER LOGIC
// ======================================================

function filteredSites() {
  if (!DATA || !DATA.sites) return [];

  const city = document.getElementById("cityFilter")?.value || "all";
  const status = document.getElementById("statusFilter")?.value || "all";
  const vendor = document.getElementById("vendorFilter")?.value || "all";
  const program = document.getElementById("programFilter")?.value || "all";
  const q = (document.getElementById("searchBox")?.value || "").toLowerCase().trim();

  return DATA.sites.filter(s => {
    if (city !== "all" && s.city !== city) return false;
    if (status !== "all" && s.status !== status) return false;
    if (vendor !== "all" && s.vendor !== vendor) return false;
    if (program !== "all" && s.program !== program) return false;

    if (q) {
      const match = [s.site_id, s.site_name, s.city, s.kecamatan, s.desa]
        .some(x => (x || "").toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

// ======================================================
// MAIN RENDER PIPELINE
// ======================================================

function render() {
  currentPage = 1;
  const sites = filteredSites();

  renderKpis(sites);
  renderMap(sites);
  renderTable(sites);
  renderCityProgress();
  renderComposition();
  renderBars();

  // Update map counter overlay
  const counterEl = document.getElementById("mapCounterText");
  if (counterEl) {
    counterEl.textContent = `${sites.length.toLocaleString("id-ID")} site 5G ditampilkan`;
  }
}

// ======================================================
// KPIS RENDER
// ======================================================

function renderKpis(sites) {
  const c = {};
  sites.forEach(s => {
    c[s.status] = (c[s.status] || 0) + 1;
  });

  const totalEl = document.getElementById("totalKpi");
  const onAirEl = document.getElementById("onAirKpi");
  const intEl = document.getElementById("integratedKpi");
  const progEl = document.getElementById("progressKpi");

  if (totalEl) totalEl.textContent = sites.length.toLocaleString("id-ID");
  if (onAirEl) onAirEl.textContent = (c["On Air"] || 0).toLocaleString("id-ID");
  if (intEl) intEl.textContent = (c["Integrated - NY OA"] || 0).toLocaleString("id-ID");
  if (progEl) progEl.textContent = ((c["Installation"] || 0) + (c["NY Install"] || 0)).toLocaleString("id-ID");

  const onAirPctEl = document.getElementById("onAirPct");
  const onAirBarEl = document.getElementById("onAirBar");
  const intPctEl = document.getElementById("integratedPct");
  const progPctEl = document.getElementById("progressPct");

  const onAirRate = pct(c["On Air"] || 0, sites.length);
  const intRate = pct(c["Integrated - NY OA"] || 0, sites.length);
  const progRate = pct((c["Installation"] || 0) + (c["NY Install"] || 0), sites.length);

  if (onAirPctEl) onAirPctEl.textContent = `${onAirRate}%`;
  if (onAirBarEl) onAirBarEl.style.width = `${onAirRate}%`;
  if (intPctEl) intPctEl.textContent = `${intRate}%`;
  if (progPctEl) progPctEl.textContent = `${progRate}%`;
}

// ======================================================
// MAP SITES UPDATE (3D VECTOR MAP & LEAFLET COMPATIBLE)
// ======================================================

function renderMap(sites) {
  if (!mapReady) return;

  if (mapType === "maplibre" && map) {
    const source = map.getSource("vanguard-sites");
    if (!source) return;

    source.setData(siteGeoJSON(sites));

    const cityVal = document.getElementById("cityFilter")?.value;
    if (cityVal && cityVal !== "all") {
      fitSites(sites);
    }
  } else if (mapType === "leaflet" && map && leafletMarkersLayer) {
    leafletMarkersLayer.clearLayers();
    const validSites = sites.filter(s => typeof s.lat === "number" && typeof s.lng === "number");

    validSites.forEach(s => {
      const markerColor = colors[s.status] || "#64748b";
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 6,
        fillColor: markerColor,
        color: "#ffffff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.92
      });

      marker.bindPopup(`
        <div class="site-popup-card">
          <div class="popup-top">
            <span class="popup-badge ${badgeClass(s.status)}">${escapeHTML(s.status || "-")}</span>
            <span class="popup-vendor ${s.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">${escapeHTML(s.vendor || "-")}</span>
          </div>
          <div class="popup-site-id">${escapeHTML(s.site_id)}</div>
          <div class="popup-site-name">${escapeHTML(s.site_name)}</div>
          <div class="popup-grid">
            <div><span>Wilayah:</span><b>${escapeHTML(s.city)}</b></div>
            <div><span>Kecamatan:</span><b>${escapeHTML(s.kecamatan || "-")}</b></div>
            <div><span>Program:</span><b>${escapeHTML(s.program || "-")}</b></div>
            <div><span>On Air Date:</span><b>${escapeHTML(s.on_air_date || "-")}</b></div>
          </div>
        </div>
      `, { maxWidth: 290, className: "vanguard-leaflet-popup" });

      leafletMarkersLayer.addLayer(marker);
    });

    const cityVal = document.getElementById("cityFilter")?.value;
    if (cityVal && cityVal !== "all" && validSites.length) {
      const group = L.featureGroup(leafletMarkersLayer.getLayers());
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }
}

function resetMapView() {
  if (!mapReady || !map) return;
  if (mapType === "maplibre") {
    map.easeTo({
      center: [112.55, -7.50],
      zoom: 8.4,
      pitch: is3D ? 45 : 0,
      bearing: is3D ? -8 : 0,
      duration: 800
    });
  } else if (mapType === "leaflet") {
    map.flyTo([-7.50, 112.55], 8.4, { duration: 0.8 });
  }
}

function fitSites(sites) {
  const valid = sites.filter(s => typeof s.lng === "number" && typeof s.lat === "number");
  if (!valid.length || !map) return;

  if (mapType === "maplibre") {
    if (valid.length === 1) {
      map.flyTo({
        center: [valid[0].lng, valid[0].lat],
        zoom: 16.5,
        pitch: is3D ? 52 : 0,
        bearing: is3D ? -12 : 0,
        duration: 900
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    valid.forEach(s => bounds.extend([s.lng, s.lat]));
    map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 800 });
  } else if (mapType === "leaflet") {
    if (valid.length === 1) {
      map.flyTo([valid[0].lat, valid[0].lng], 16, { duration: 0.8 });
    } else {
      const bounds = L.latLngBounds(valid.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }
}

function flyToSite(site) {
  if (!site || typeof site.lng !== "number" || typeof site.lat !== "number") return;

  if (mapType === "maplibre" && map) {
    map.flyTo({
      center: [site.lng, site.lat],
      zoom: 17, // Zoom dekat langsung ke lokasi site
      pitch: is3D ? 55 : 0, // Perspektif 3D miring untuk melihat bangunan 3D sekitar site
      bearing: is3D ? -12 : 0,
      speed: 1.2,
      essential: true
    });

    setTimeout(() => {
      showMapPopup([site.lng, site.lat], site);
    }, 650);
  } else if (mapType === "leaflet" && map) {
    map.flyTo([site.lat, site.lng], 17, { duration: 0.9 });
    setTimeout(() => {
      showMapPopup([site.lng, site.lat], site);
    }, 400);
  }

  updateFloatingSiteCard(site);
}

// ======================================================
// SITES TABLE RENDER
// ======================================================

function renderTable(sites) {
  const tbody = document.getElementById("siteTable");
  const pageInfo = document.getElementById("pageInfo");
  const countInfo = document.getElementById("tableResultCount");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (!tbody) return;

  if (!sites.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="table-empty-state">
          <div style="padding:28px 12px;text-align:center;color:#64748b;">
            <div style="font-size:24px;margin-bottom:6px;">🔍</div>
            <b>Tidak ada site yang cocok dengan filter atau kata kunci.</b>
            <div style="font-size:12px;margin-top:4px;">Coba ubah kriteria pencarian atau klik tombol Reset.</div>
          </div>
        </td>
      </tr>
    `;
    if (pageInfo) pageInfo.textContent = "Halaman 0 / 0";
    if (countInfo) countInfo.textContent = "0 site ditemukan";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(sites.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageSlice = sites.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageSlice.map(s => `
    <tr class="site-row-clickable" onclick="handleRowClick('${escapeHTML(s.site_id)}')">
      <td class="col-site-id">
        <span class="mono-badge">${escapeHTML(s.site_id || "-")}</span>
      </td>
      <td class="col-site-name">
        <b>${escapeHTML(s.site_name || "-")}</b>
      </td>
      <td>${escapeHTML(s.city || "-")}</td>
      <td>${escapeHTML(s.kecamatan || "-")}</td>
      <td>
        <span class="program-tag ${s.program === '5G Coverage' ? 'tag-coverage' : 'tag-refarm'}">
          ${escapeHTML(s.program || "-")}
        </span>
      </td>
      <td>
        <span class="status-pill ${badgeClass(s.status)}">
          ${escapeHTML(s.status || "-")}
        </span>
      </td>
      <td>
        <span class="vendor-tag ${s.vendor === 'Huawei' ? 'vendor-huawei' : 'vendor-nokia'}">
          ${escapeHTML(s.vendor || "-")}
        </span>
      </td>
      <td class="col-date">${escapeHTML(s.integration_date || "-")}</td>
      <td class="col-date">${escapeHTML(s.on_air_date || "-")}</td>
    </tr>
  `).join("");

  if (pageInfo) {
    pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages}`;
  }

  if (countInfo) {
    const end = Math.min(start + PAGE_SIZE, sites.length);
    countInfo.innerHTML = `Menampilkan <b>${start + 1}–${end}</b> dari <b>${sites.length.toLocaleString("id-ID")}</b> site 5G`;
  }

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

window.handleRowClick = function(siteId) {
  if (!DATA || !DATA.sites) return;
  const site = DATA.sites.find(s => s.site_id === siteId);
  if (site && typeof site.lng === "number" && typeof site.lat === "number") {
    flyToSite(site);
    // Smooth scroll to map
    const mapCard = document.querySelector(".mapcard");
    if (mapCard) {
      mapCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
};

// ======================================================
// REGIONAL PROGRESS LIST
// ======================================================

function renderCityProgress() {
  const container = document.getElementById("cityProgress");
  if (!container || !DATA || !DATA.cities) return;

  const sortedCities = [...DATA.cities].sort((a, b) => (b.on_air_rate || 0) - (a.on_air_rate || 0));

  container.innerHTML = sortedCities.map(c => {
    const rate = Number(c.on_air_rate || 0).toFixed(1);
    const onAir = c.on_air || 0;
    const total = c.total || 0;

    return `
      <div class="progress-row-item">
        <div class="prog-info-top">
          <span class="prog-city-name">${escapeHTML(c.city)}</span>
          <span class="prog-count-sub">${onAir} / ${total} site</span>
          <b class="prog-pct-pill">${rate}%</b>
        </div>
        <div class="prog-track">
          <div class="prog-fill" style="width:${rate}%;"></div>
        </div>
      </div>
    `;
  }).join("");
}

// ======================================================
// STATUS COMPOSITION DONUT
// ======================================================

function renderComposition() {
  const donutEl = document.getElementById("statusDonut");
  const legendEl = document.getElementById("statusLegend");
  const totalEl = document.getElementById("donutTotal");

  if (!DATA || !DATA.summary) return;

  const counts = DATA.summary.status_counts || {};
  const total = DATA.summary.total_sites || 1741;
  const keys = ["On Air", "Integrated - NY OA", "Installation", "NY Install"];

  let acc = 0;
  const gradientParts = [];

  keys.forEach(k => {
    const val = counts[k] || 0;
    const p = (val / total) * 100;
    const color = colors[k] || "#64748b";
    gradientParts.push(`${color} ${acc.toFixed(1)}% ${(acc + p).toFixed(1)}%`);
    acc += p;
  });

  if (donutEl) {
    donutEl.style.background = `conic-gradient(${gradientParts.join(", ")})`;
  }

  if (totalEl) {
    totalEl.textContent = total.toLocaleString("id-ID");
  }

  if (legendEl) {
    legendEl.innerHTML = keys.map(k => {
      const val = counts[k] || 0;
      const percentage = pct(val, total);
      return `
        <div class="donut-legend-item">
          <div class="legend-color-dot" style="background:${colors[k]};"></div>
          <span class="legend-name">${k}</span>
          <div class="legend-values">
            <b>${val.toLocaleString("id-ID")}</b>
            <small>(${percentage}%)</small>
          </div>
        </div>
      `;
    }).join("");
  }
}

// ======================================================
// BAR CHARTS (VENDOR & PROGRAM)
// ======================================================

function renderBars() {
  if (!DATA || !DATA.summary) return;

  const vendorEl = document.getElementById("vendorBars");
  const programEl = document.getElementById("programBars");

  // Vendor Chart
  if (vendorEl && DATA.summary.vendor_counts) {
    const vc = DATA.summary.vendor_counts;
    const total = (vc.Nokia || 0) + (vc.Huawei || 0);
    const nokiaPct = pct(vc.Nokia || 0, total);
    const huaweiPct = pct(vc.Huawei || 0, total);

    vendorEl.innerHTML = `
      <div class="vendor-comparison-card">
        <div class="vendor-ratio-bar">
          <div class="bar-nokia" style="width:${nokiaPct}%;" title="Nokia: ${nokiaPct}%">
            <span>Nokia ${nokiaPct}%</span>
          </div>
          <div class="bar-huawei" style="width:${huaweiPct}%;" title="Huawei: ${huaweiPct}%">
            <span>Huawei ${huaweiPct}%</span>
          </div>
        </div>
        <div class="vendor-details-grid">
          <div class="vendor-item-detail nokia-side">
            <span class="v-dot dot-nokia"></span>
            <div>
              <b>Nokia</b>
              <span>${(vc.Nokia || 0).toLocaleString("id-ID")} Sites (${nokiaPct}%)</span>
            </div>
          </div>
          <div class="vendor-item-detail huawei-side">
            <span class="v-dot dot-huawei"></span>
            <div>
              <b>Huawei</b>
              <span>${(vc.Huawei || 0).toLocaleString("id-ID")} Sites (${huaweiPct}%)</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Program Chart
  if (programEl && DATA.summary.program_counts) {
    const pc = DATA.summary.program_counts;
    const total = (pc["5G Coverage"] || 0) + (pc["5G Refarm"] || 0);
    const covPct = pct(pc["5G Coverage"] || 0, total);
    const refPct = pct(pc["5G Refarm"] || 0, total);

    programEl.innerHTML = `
      <div class="vendor-comparison-card">
        <div class="vendor-ratio-bar">
          <div class="bar-coverage" style="width:${covPct}%;" title="5G Coverage: ${covPct}%">
            <span>Coverage ${covPct}%</span>
          </div>
          <div class="bar-refarm" style="width:${refPct}%;" title="5G Refarm: ${refPct}%">
            <span>Refarm ${refPct}%</span>
          </div>
        </div>
        <div class="vendor-details-grid">
          <div class="vendor-item-detail coverage-side">
            <span class="v-dot dot-coverage"></span>
            <div>
              <b>5G Coverage</b>
              <span>${(pc["5G Coverage"] || 0).toLocaleString("id-ID")} Sites (${covPct}%)</span>
            </div>
          </div>
          <div class="vendor-item-detail refarm-side">
            <span class="v-dot dot-refarm"></span>
            <div>
              <b>5G Refarm</b>
              <span>${(pc["5G Refarm"] || 0).toLocaleString("id-ID")} Sites (${refPct}%)</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// ======================================================
// EVENT LISTENERS
// ======================================================

["cityFilter", "statusFilter", "vendorFilter", "programFilter"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", render);
});

const searchEl = document.getElementById("searchBox");
if (searchEl) {
  searchEl.addEventListener("input", render);
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      zoomToSiteLocation(searchEl.value);
    }
  });
}

const prevBtn = document.getElementById("prevBtn");
if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    const sites = filteredSites();
    currentPage = Math.max(1, currentPage - 1);
    renderTable(sites);
  });
}

const nextBtn = document.getElementById("nextBtn");
if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    const sites = filteredSites();
    const totalPages = Math.ceil(sites.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable(sites);
    }
  });
}

// CSV Export
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    try {
      const origText = exportBtn.innerHTML;
      exportBtn.innerHTML = "<span>Mengunduh...</span>";
      const r = await fetch("/api/export/sites");
      if (!r.ok) throw new Error("Gagal mengunduh CSV");

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `east_java_vanguard_5g_sites_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      exportBtn.innerHTML = origText;
    } catch (e) {
      alert("Export gagal: " + e.message);
    }
  });
}

// Start application
init();