
let DATA=null, currentPage=1;
const PAGE_SIZE=35;
const colors={"On Air":"#20ad67","Integrated - NY OA":"#348ce4","Installation":"#f2b51d","NY Install":"#97a4b3"};
const map=L.map("map").setView([-7.45,112.55],8);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OpenStreetMap contributors &copy; CARTO"}).addTo(map);
const layer=L.markerClusterGroup({showCoverageOnHover:false,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,disableClusteringAtZoom:15,maxClusterRadius:45}).addTo(map);

function pct(v,t){return t?((v/t)*100).toFixed(1):"0.0"}
function clock(){const d=new Date();clockEl=document.getElementById("clock");clockEl.innerHTML=d.toLocaleDateString("id-ID",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})+"<br>"+d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+" WIB"}
clock();setInterval(clock,30000);
let secs=1800;setInterval(()=>{secs=Math.max(0,secs-1);sessionTimer.textContent=String(Math.floor(secs/60)).padStart(2,"0")+":"+String(secs%60).padStart(2,"0")},1000);

async function init(){
  const r=await fetch("/api/dashboard",{cache:"no-store"});
  if(!r.ok) throw new Error("Gagal mengambil data");
  DATA=await r.json();
  Object.keys(DATA.summary.city_counts).sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;cityFilter.appendChild(o)});
  render();
}

function filteredSites(){
  const city=cityFilter.value,status=statusFilter.value,vendor=vendorFilter.value,program=programFilter.value,q=(searchBox.value||"").toLowerCase();
  return DATA.sites.filter(s=>
    (city==="all"||s.city===city)&&
    (status==="all"||s.status===status)&&
    (vendor==="all"||s.vendor===vendor)&&
    (program==="all"||s.program===program)&&
    (!q||[s.site_id,s.site_name,s.city,s.kecamatan].some(x=>(x||"").toLowerCase().includes(q)))
  );
}

function render(){
  currentPage=1;
  const sites=filteredSites();
  renderKpis(sites); renderMap(sites); renderTable(sites); renderCityProgress(); renderComposition(); renderBars();
}
function renderKpis(sites){
  const c={};sites.forEach(s=>c[s.status]=(c[s.status]||0)+1);
  totalKpi.textContent=sites.length.toLocaleString("id-ID");
  onAirKpi.textContent=(c["On Air"]||0).toLocaleString("id-ID");
  integratedKpi.textContent=(c["Integrated - NY OA"]||0).toLocaleString("id-ID");
  progressKpi.textContent=((c["Installation"]||0)+(c["NY Install"]||0)).toLocaleString("id-ID");
  onAirPct.textContent=pct(c["On Air"]||0,sites.length)+"% dari filter aktif";
  integratedPct.textContent=pct(c["Integrated - NY OA"]||0,sites.length)+"% dari filter aktif";
  progressPct.textContent=pct((c["Installation"]||0)+(c["NY Install"]||0),sites.length)+"% dari filter aktif";
}
function renderMap(sites){
  layer.clearLayers();
  sites.forEach(s=>{
    if(typeof s.lat!=="number"||typeof s.lng!=="number")return;
    L.circleMarker([s.lat,s.lng],{radius:3.1,weight:0,fillOpacity:.85,fillColor:colors[s.status]||"#777"})
      .bindTooltip(`<b>${s.site_id}</b><br>${s.site_name}<br>${s.city} • ${s.status}<br>${s.vendor}`)
      .addTo(layer);
  });
  if(cityFilter.value!=="all"&&sites.length){
    const avgLat=sites.reduce((a,s)=>a+(s.lat||0),0)/sites.length,avgLng=sites.reduce((a,s)=>a+(s.lng||0),0)/sites.length;
    map.setView([avgLat,avgLng],10);
  } else map.setView([-7.45,112.55],8);
}
function badgeClass(s){return s==="On Air"?"s-onair":s==="Integrated - NY OA"?"s-int":s==="Installation"?"s-inst":"s-nyi"}
function renderTable(sites){
  const pages=Math.max(1,Math.ceil(sites.length/PAGE_SIZE));currentPage=Math.min(currentPage,pages);
  const start=(currentPage-1)*PAGE_SIZE;
  siteTable.innerHTML=sites.slice(start,start+PAGE_SIZE).map(s=>`<tr>
    <td><b>${s.site_id||""}</b></td><td>${s.site_name||""}</td><td>${s.city||""}</td><td>${s.kecamatan||""}</td>
    <td>${s.program||""}</td><td><span class="status-pill ${badgeClass(s.status)}">${s.status||""}</span></td>
    <td>${s.vendor||""}</td><td>${s.integration_date||"—"}</td><td>${s.on_air_date||"—"}</td></tr>`).join("");
  pageInfo.textContent=`${currentPage} / ${pages} • ${sites.length.toLocaleString("id-ID")} site`;
  prevBtn.disabled=currentPage<=1;nextBtn.disabled=currentPage>=pages;
}
function renderCityProgress(){
  cityProgress.innerHTML=DATA.cities.slice(0,13).map(c=>`<div class="prow"><span>${c.city}</span><div class="track"><div class="fill" style="width:${c.on_air_rate}%"></div></div><b>${c.on_air_rate.toFixed(1)}%</b></div>`).join("");
}
function renderComposition(){
  const counts=DATA.summary.status_counts,total=DATA.summary.total_sites;
  const keys=["On Air","Integrated - NY OA","Installation","NY Install"];
  let acc=0,parts=[];
  keys.forEach(k=>{const p=(counts[k]||0)/total*100;parts.push(`${colors[k]} ${acc}% ${acc+p}%`);acc+=p});
  statusDonut.style.background=`conic-gradient(${parts.join(",")})`;
  donutTotal.textContent=total.toLocaleString("id-ID");
  statusLegend.innerHTML=keys.map(k=>`<div class="dleg"><i class="dot" style="background:${colors[k]}"></i><span>${k}</span><b>${(counts[k]||0).toLocaleString("id-ID")} (${pct(counts[k]||0,total)}%)</b></div>`).join("");
}
function makeBars(el,obj,color){
  const total=Object.values(obj).reduce((a,b)=>a+b,0),max=Math.max(...Object.values(obj));
  el.innerHTML=Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="vrow"><span>${k}</span><div class="vbar"><i style="width:${v/max*100}%;background:${color}"></i></div><b>${v} • ${pct(v,total)}%</b></div>`).join("");
}
function renderBars(){makeBars(vendorBars,DATA.summary.vendor_counts,"#348ce4");makeBars(programBars,DATA.summary.program_counts,"#20ad67")}
[cityFilter,statusFilter,vendorFilter,programFilter].forEach(x=>x.addEventListener("change",render));
searchBox.addEventListener("input",render);
prevBtn.addEventListener("click",()=>{const s=filteredSites();currentPage=Math.max(1,currentPage-1);renderTable(s)});
nextBtn.addEventListener("click",()=>{const s=filteredSites();currentPage++;renderTable(s)});
const e=document.getElementById("exportBtn");if(e)e.addEventListener("click",async()=>{const r=await fetch("/api/export");const j=await r.json();alert(j.message||"Export")});
init().catch(e=>alert(e.message));
