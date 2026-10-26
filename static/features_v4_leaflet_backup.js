
let DATA=null;
const page=document.body.dataset.page;
const role=document.body.dataset.role;
const byId=id=>document.getElementById(id);
const fmt=n=>(n??0).toLocaleString("id-ID");
const pct=(v,t)=>t?(v/t*100):0;

async function getData(){
  const r=await fetch("/api/dashboard",{cache:"no-store"});
  if(!r.ok) throw new Error("Tidak dapat mengambil data dashboard");
  DATA=await r.json();
  if(page==="sites") initSites();
  if(page==="analytics") initAnalytics();
  if(page==="regional") initRegional();
  if(page==="network") initNetwork();
  if(page==="planning") initPlanning();
}

function barRows(obj, opts={}){
  const entries=Array.isArray(obj)?obj:Object.entries(obj).map(([label,value])=>({label,value}));
  const max=Math.max(1,...entries.map(x=>+x.value||0));
  return entries.map(x=>{
    const p=(+x.value||0)/max*100;
    const sub=x.sub||"";
    return `<div class="metric-row"><span class="metric-label">${x.label}</span><div class="metric-track"><i style="width:${p}%"></i></div><b>${x.display??fmt(x.value)}</b>${sub?`<small>${sub}</small>`:""}</div>`;
  }).join("");
}

let map, siteLayer, sitePage = 1;
let siteMarkers = {};

const PAGE = 40;

function initSites(){

  const cities = [...new Set(DATA.sites.map(s => s.city))]
    .filter(Boolean)
    .sort();

  cities.forEach(c => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    byId("fCity").appendChild(o);
  });


  map = L.map("sitesMap").setView([-7.45, 112.55], 8);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 20
    }
  ).addTo(map);


  siteLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 15,
    maxClusterRadius: 45
  }).addTo(map);


  ["fCity", "fStatus", "fVendor"].forEach(id => {

    const el = byId(id);

    if(el){
      el.addEventListener("change", () => {
        sitePage = 1;
        renderSites();
      });
    }

  });


  const search = byId("siteSearch");

  if(search){

    // Tetap berfungsi sebagai filter saat mengetik
    search.addEventListener("input", () => {
      sitePage = 1;
      renderSites();
    });

    // Enter = langsung cari dan zoom
    search.addEventListener("keydown", e => {

      if(e.key === "Enter"){
        e.preventDefault();
        focusSiteBySearch();
      }

    });

  }


  const prev = byId("sitePrev");

  if(prev){
    prev.addEventListener("click", () => {

      sitePage = Math.max(1, sitePage - 1);
      renderSites();

    });
  }


  const next = byId("siteNext");

  if(next){
    next.addEventListener("click", () => {

      sitePage++;
      renderSites();

    });
  }


  renderSites();
}



function siteFiltered(){

  const c = byId("fCity")?.value || "all";
  const s = byId("fStatus")?.value || "all";
  const v = byId("fVendor")?.value || "all";

  const q = (byId("siteSearch")?.value || "")
    .trim()
    .toLowerCase();


  return DATA.sites.filter(x => {

    const cityOk =
      c === "all" || x.city === c;

    const statusOk =
      s === "all" || x.status === s;

    const vendorOk =
      v === "all" || x.vendor === v;


    const searchOk =
      !q ||
      String(x.site_id || "").toLowerCase().includes(q) ||
      String(x.site_name || "").toLowerCase().includes(q);


    return cityOk && statusOk && vendorOk && searchOk;

  });

}



function renderSites(){

  const a = siteFiltered();

  const counts = {};

  a.forEach(x => {
    counts[x.status] = (counts[x.status] || 0) + 1;
  });


  if(byId("sitesTotal")){
    byId("sitesTotal").textContent = fmt(a.length);
  }

  if(byId("sitesOnAir")){
    byId("sitesOnAir").textContent =
      fmt(counts["On Air"] || 0);
  }

  if(byId("sitesInt")){
    byId("sitesInt").textContent =
      fmt(counts["Integrated - NY OA"] || 0);
  }

  if(byId("sitesProgress")){
    byId("sitesProgress").textContent =
      fmt(
        (counts["Installation"] || 0) +
        (counts["NY Install"] || 0)
      );
  }


  const colors = {
    "On Air": "#20ad67",
    "Integrated - NY OA": "#348ce4",
    "Installation": "#f2b51d",
    "NY Install": "#97a4b3"
  };


  siteLayer.clearLayers();
  siteMarkers = {};


  a.forEach(x => {

    if(
      typeof x.lat === "number" &&
      typeof x.lng === "number"
    ){

      const marker = L.circleMarker(
        [x.lat, x.lng],
        {
          radius: 5,
          weight: 1,
          color: "#ffffff",
          fillOpacity: .9,
          fillColor: colors[x.status] || "#888"
        }
      );


      marker.bindPopup(`
        <div style="min-width:200px;line-height:1.45">

          <div style="
            font-size:15px;
            font-weight:800;
            margin-bottom:4px;
          ">
            ${x.site_id || "-"}
          </div>

          <div style="margin-bottom:8px">
            ${x.site_name || "-"}
          </div>

          <b>City:</b>
          ${x.city || "-"}<br>

          <b>Kecamatan:</b>
          ${x.kecamatan || "-"}<br>

          <b>Status:</b>
          ${x.status || "-"}<br>

          <b>Vendor:</b>
          ${x.vendor || "-"}<br>

          <b>Program:</b>
          ${x.program || "-"}<br>

          <b>Integration:</b>
          ${x.integration_date || "-"}<br>

          <b>On Air:</b>
          ${x.on_air_date || "-"}

        </div>
      `);


      marker.bindTooltip(
        `
          <b>${x.site_id || "-"}</b><br>
          ${x.site_name || "-"}<br>
          ${x.city || "-"}<br>
          ${x.status || "-"}
        `
      );


      const key =
        String(x.site_id || "")
          .trim()
          .toLowerCase();

      if(key){
        siteMarkers[key] = marker;
      }


      marker.addTo(siteLayer);

    }

  });



  const pages = Math.max(
    1,
    Math.ceil(a.length / PAGE)
  );


  sitePage = Math.min(sitePage, pages);


  const slice = a.slice(
    (sitePage - 1) * PAGE,
    sitePage * PAGE
  );


  if(byId("sitesBody")){

    byId("sitesBody").innerHTML =
      slice.map(x => `

        <tr>

          <td>
            <b>${x.site_id || "-"}</b>
          </td>

          <td>
            ${x.site_name || "-"}
          </td>

          <td>
            ${x.city || "-"}
          </td>

          <td>
            ${x.kecamatan || "-"}
          </td>

          <td>
            ${x.status || "-"}
          </td>

          <td>
            ${x.vendor || "-"}
          </td>

          <td>
            ${x.program || "-"}
          </td>

          <td>
            ${x.integration_date || "-"}
          </td>

          <td>
            ${x.on_air_date || "-"}
          </td>

        </tr>

      `).join("");

  }


  if(byId("sitePage")){

    byId("sitePage").textContent =
      `Page ${sitePage}/${pages} • ${fmt(a.length)} site`;

  }


  if(byId("sitePrev")){
    byId("sitePrev").disabled =
      sitePage <= 1;
  }

  if(byId("siteNext")){
    byId("siteNext").disabled =
      sitePage >= pages;
  }

}



function focusSiteBySearch(){

  if(
    !DATA ||
    !Array.isArray(DATA.sites) ||
    !map ||
    !siteLayer
  ){
    return;
  }


  const input = byId("siteSearch");

  if(!input){
    return;
  }


  const query =
    input.value
      .trim()
      .toLowerCase();


  if(!query){
    return;
  }


  // 1. Prioritas exact Site ID
  let site = DATA.sites.find(x =>
    String(x.site_id || "")
      .trim()
      .toLowerCase() === query
  );


  // 2. Exact Site Name
  if(!site){

    site = DATA.sites.find(x =>
      String(x.site_name || "")
        .trim()
        .toLowerCase() === query
    );

  }


  // 3. Partial match
  if(!site){

    site = DATA.sites.find(x =>

      String(x.site_id || "")
        .toLowerCase()
        .includes(query)

      ||

      String(x.site_name || "")
        .toLowerCase()
        .includes(query)

    );

  }


  if(!site){

    alert("Site ID / Site Name tidak ditemukan.");
    return;

  }


  if(
    typeof site.lat !== "number" ||
    typeof site.lng !== "number"
  ){

    alert(
      "Site ditemukan, tetapi koordinat tidak tersedia."
    );

    return;
  }


  // Reset filter supaya site target pasti tampil
  if(byId("fCity")){
    byId("fCity").value = "all";
  }

  if(byId("fStatus")){
    byId("fStatus").value = "all";
  }

  if(byId("fVendor")){
    byId("fVendor").value = "all";
  }


  // Isi search dengan ID yang ditemukan
  input.value =
    site.site_id ||
    site.site_name ||
    query;


  sitePage = 1;

  renderSites();


  const key =
    String(site.site_id || "")
      .trim()
      .toLowerCase();


  const marker =
    siteMarkers[key];


  if(!marker){

    map.flyTo(
      [site.lat, site.lng],
      17,
      {
        animate: true,
        duration: 1.2
      }
    );

    return;
  }


  // MarkerCluster otomatis membuka cluster
  siteLayer.zoomToShowLayer(
    marker,
    function(){

      map.flyTo(
        [site.lat, site.lng],
        18,
        {
          animate: true,
          duration: 1.1
        }
      );


      setTimeout(() => {

        marker.openPopup();

      }, 500);

    }
  );

}
function initAnalytics(){
  const s=DATA.summary,total=s.total_sites,onair=s.status_counts["On Air"]||0;
  byId("aTotal").textContent=fmt(total);byId("aRate").textContent=pct(onair,total).toFixed(1)+"%";byId("aNokia").textContent=fmt(s.vendor_counts.Nokia);byId("aHuawei").textContent=fmt(s.vendor_counts.Huawei);
  byId("statusBars").innerHTML=barRows(s.status_counts);
  byId("vendorAnalytics").innerHTML=barRows(s.vendor_counts);
  byId("programAnalytics").innerHTML=barRows(s.program_counts);
  const top=[...DATA.cities].sort((a,b)=>b.on_air_rate-a.on_air_rate).slice(0,10).map(x=>({label:x.city,value:x.on_air_rate,display:x.on_air_rate.toFixed(1)+"%"}));
  byId("topCityBars").innerHTML=barRows(top);
}

function initRegional(){
  byId("regionalSearch").addEventListener("input",renderRegional);renderRegional();
}
function renderRegional(){
  const q=byId("regionalSearch").value.toLowerCase();
  const rows=DATA.cities.filter(x=>x.city.toLowerCase().includes(q)).sort((a,b)=>b.total-a.total);
  byId("regionalBody").innerHTML=rows.map(x=>`<tr><td><b>${x.city}</b></td><td>${fmt(x.total)}</td><td>${fmt(x.kecamatan)}</td><td>${fmt(x.on_air)}</td><td>${fmt(x.integrated_ny_oa)}</td><td>${fmt(x.installation)}</td><td>${fmt(x.ny_install)}</td><td>${x.on_air_rate.toFixed(1)}%</td><td>${fmt(x.nokia)}</td><td>${fmt(x.huawei)}</td></tr>`).join("");
  const ranked=[...rows].sort((a,b)=>b.on_air_rate-a.on_air_rate).map(x=>({label:x.city,value:x.on_air_rate,display:x.on_air_rate.toFixed(1)+"%"}));
  byId("regionalBars").innerHTML=barRows(ranked);
}

function initNetwork(){
  const s=DATA.summary.status_counts,total=DATA.summary.total_sites,onair=s["On Air"]||0;
  byId("nCompletion").textContent=pct(onair,total).toFixed(1)+"%";
  byId("nIntegrated").textContent=fmt(s["Integrated - NY OA"]||0);
  byId("nInstallation").textContent=fmt(s["Installation"]||0);
  byId("nNotYet").textContent=fmt(s["NY Install"]||0);
  byId("networkRegionBars").innerHTML=barRows([...DATA.cities].sort((a,b)=>b.on_air_rate-a.on_air_rate).map(x=>({label:x.city,value:x.on_air_rate,display:x.on_air_rate.toFixed(1)+"%"})));
  const backlog={Nokia:0,Huawei:0};DATA.sites.filter(x=>x.status!=="On Air").forEach(x=>backlog[x.vendor]=(backlog[x.vendor]||0)+1);
  byId("networkBacklog").innerHTML=barRows(backlog);
}

function initPlanning(){
  const s=DATA.summary.status_counts;
  byId("pBacklog").textContent=fmt(DATA.summary.total_sites-(s["On Air"]||0));
  byId("pIntegrated").textContent=fmt(s["Integrated - NY OA"]||0);
  byId("pInstallation").textContent=fmt(s["Installation"]||0);
  byId("pNYInstall").textContent=fmt(s["NY Install"]||0);
  byId("planStatus").addEventListener("change",renderPlanning);byId("planSearch").addEventListener("input",renderPlanning);renderPlanning();
}
function renderPlanning(){
  const s=byId("planStatus").value,q=byId("planSearch").value.toLowerCase();
  const a=DATA.sites.filter(x=>x.status!=="On Air"&&(s==="all"||x.status===s)&&(!q||[x.site_id,x.site_name,x.city].some(v=>(v||"").toLowerCase().includes(q)))).slice(0,500);
  byId("planningBody").innerHTML=a.map(x=>`<tr><td><b>${x.site_id}</b></td><td>${x.site_name}</td><td>${x.city}</td><td>${x.kecamatan}</td><td>${x.status}</td><td>${x.vendor}</td><td>${x.program}</td><td>${x.integration_date||"—"}</td></tr>`).join("");
}

if(["sites","analytics","regional","network","planning"].includes(page)) getData().catch(e=>alert(e.message));


// ===== Direct Site Locator =====
function focusSiteFromSearch(){
  if(!DATA || !Array.isArray(DATA.sites) || !map) return;

  const input = byId("siteSearch");
  if(!input) return;

  const query = input.value.trim().toLowerCase();
  if(!query) return;

  // Prioritaskan exact Site ID, kemudian exact Site Name,
  // terakhir partial Site ID / Site Name.
  let site = DATA.sites.find(x =>
    String(x.site_id || "").toLowerCase() === query
  );

  if(!site){
    site = DATA.sites.find(x =>
      String(x.site_name || "").toLowerCase() === query
    );
  }

  if(!site){
    site = DATA.sites.find(x =>
      String(x.site_id || "").toLowerCase().includes(query) ||
      String(x.site_name || "").toLowerCase().includes(query)
    );
  }

  if(!site){
    alert("Site tidak ditemukan.");
    return;
  }

  if(typeof site.lat !== "number" || typeof site.lng !== "number"){
    alert("Site ditemukan, tetapi koordinat tidak tersedia.");
    return;
  }

  // Kosongkan filter agar site pasti dapat ditampilkan.
  const city = byId("fCity");
  const status = byId("fStatus");
  const vendor = byId("fVendor");

  if(city) city.value = "all";
  if(status) status.value = "all";
  if(vendor) vendor.value = "all";

  input.value = site.site_id || site.site_name || query;

  sitePage = 1;
  renderSites();

  // Fokus langsung ke koordinat site.
  map.flyTo([site.lat, site.lng], 17, {
    animate: true,
    duration: 1.2
  });

  setTimeout(() => {
    L.popup({
      autoPan: true,
      closeButton: true
    })
    .setLatLng([site.lat, site.lng])
    .setContent(`
      <div style="min-width:180px">
        <b>${site.site_id || "-"}</b><br>
        ${site.site_name || "-"}<br>
        <b>City:</b> ${site.city || "-"}<br>
        <b>Kecamatan:</b> ${site.kecamatan || "-"}<br>
        <b>Status:</b> ${site.status || "-"}<br>
        <b>Vendor:</b> ${site.vendor || "-"}<br>
        <b>Program:</b> ${site.program || "-"}
      </div>
    `)
    .openOn(map);
  }, 700);
}

document.addEventListener("keydown", function(e){
  const search = byId("siteSearch");

  if(
    e.key === "Enter" &&
    search &&
    document.activeElement === search
  ){
    e.preventDefault();
    focusSiteFromSearch();
  }
});


// ===== Direct Site Locator =====
function focusSiteFromSearch(){
  if(!DATA || !Array.isArray(DATA.sites) || !map) return;

  const input = byId("siteSearch");
  if(!input) return;

  const query = input.value.trim().toLowerCase();
  if(!query) return;

  // Prioritaskan exact Site ID, kemudian exact Site Name,
  // terakhir partial Site ID / Site Name.
  let site = DATA.sites.find(x =>
    String(x.site_id || "").toLowerCase() === query
  );

  if(!site){
    site = DATA.sites.find(x =>
      String(x.site_name || "").toLowerCase() === query
    );
  }

  if(!site){
    site = DATA.sites.find(x =>
      String(x.site_id || "").toLowerCase().includes(query) ||
      String(x.site_name || "").toLowerCase().includes(query)
    );
  }

  if(!site){
    alert("Site tidak ditemukan.");
    return;
  }

  if(typeof site.lat !== "number" || typeof site.lng !== "number"){
    alert("Site ditemukan, tetapi koordinat tidak tersedia.");
    return;
  }

  // Kosongkan filter agar site pasti dapat ditampilkan.
  const city = byId("fCity");
  const status = byId("fStatus");
  const vendor = byId("fVendor");

  if(city) city.value = "all";
  if(status) status.value = "all";
  if(vendor) vendor.value = "all";

  input.value = site.site_id || site.site_name || query;

  sitePage = 1;
  renderSites();

  // Fokus langsung ke koordinat site.
  map.flyTo([site.lat, site.lng], 17, {
    animate: true,
    duration: 1.2
  });

  setTimeout(() => {
    L.popup({
      autoPan: true,
      closeButton: true
    })
    .setLatLng([site.lat, site.lng])
    .setContent(`
      <div style="min-width:180px">
        <b>${site.site_id || "-"}</b><br>
        ${site.site_name || "-"}<br>
        <b>City:</b> ${site.city || "-"}<br>
        <b>Kecamatan:</b> ${site.kecamatan || "-"}<br>
        <b>Status:</b> ${site.status || "-"}<br>
        <b>Vendor:</b> ${site.vendor || "-"}<br>
        <b>Program:</b> ${site.program || "-"}
      </div>
    `)
    .openOn(map);
  }, 700);
}

document.addEventListener("keydown", function(e){
  const search = byId("siteSearch");

  if(
    e.key === "Enter" &&
    search &&
    document.activeElement === search
  ){
    e.preventDefault();
    focusSiteFromSearch();
  }
});
