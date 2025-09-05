document.addEventListener('DOMContentLoaded', () => {

    let map = L.map('map').setView([46.6, 2.5], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);

    // --- Custom Moon Icon ---
    const moonIcon = L.icon({
        iconUrl: 'img/moon.png',  // <-- make sure moon.png exists in img/
        iconSize: [32, 32],       // size of the icon
        iconAnchor: [16, 16],     // point of the icon which will correspond to marker's location
        popupAnchor: [0, -16]     // point from which the popup should open relative to the iconAnchor
    });

    let markers = L.markerClusterGroup();
    map.addLayer(markers);

    let countryLayer = null;
    let countryGeoJson = null;


    let simulants = [], sites = [], minerals = [], chemicals = [], references = [];
    let mineralChart = null;
    let chemicalChart = null;
    let markerMap = {}; // Map simulant_id -> marker

// --- Country resolution helpers ---
const iso3Map = {
  // explicit mappings from your simulant.csv values to ISO_A3
  "USA": "USA",
  "UK": "GBR",
  "EU": null,            // no single polygon; skip or map to a specific EU country if you prefer
  "EU, Italy": "ITA",
  "China": "CHN",
  "Australia": "AUS",
  "Canada": "CAN",
  "Japan": "JPN",
  "South Korea": "KOR",
  "India": "IND",
  "Turkey": "TUR",       // some GeoJSONs may use "TUR", newer ones may use Türkiye as name
  "Thailand": "THA"
};

// normalize text (remove accents, lower, strip punctuation)
function norm(x) {
  return (x || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// common name aliases you might encounter in GeoJSON properties
const nameAlias = {
  "usa": ["united states of america", "united states", "us"],
  "uk": ["united kingdom", "great britain", "britain", "gb"],
  "south korea": ["republic of korea", "korea republic of", "korea south", "korea, south"],
  "turkey": ["turkiye"],          // handle Türkiye
  "czech republic": ["czechia"]
};

// Try to find a country feature matching the simulant country value.
// It checks: explicit ISO3 map -> ISO2/ISO3 direct -> name matches across common props.
function getCountryFeature(rawCode) {
  if (!countryGeoJson || !rawCode) return null;

  // handle composite like "EU, Italy" → take last token (Italy)
  let code = rawCode.toString().split(",").map(s => s.trim()).filter(Boolean).pop();

  // skip EU (no single polygon) unless you map it above
  if (norm(code) === "eu") {
    console.warn("EU has no single polygon; skipping highlight. (Map it in iso3Map if desired.)");
    return null;
  }

  // 1) Try ISO_A3 via explicit map or direct 3-letter code
  const iso3 = iso3Map[code] || (code.length === 3 ? code.toUpperCase() : null);
  if (iso3) {
    const f = countryGeoJson.features.find(
      feat => (feat.properties?.ISO_A3 || "").toUpperCase() === iso3
    );
    if (f) return f;
  }

  // 2) Try ISO_A2 if a 2-letter code slipped in
  if (code.length === 2) {
    const iso2 = code.toUpperCase();
    const f = countryGeoJson.features.find(
      feat => (feat.properties?.ISO_A2 || "").toUpperCase() === iso2
    );
    if (f) return f;
  }

  // 3) Try name-based matching across common name props
  const target = norm(code);
  const aliases = nameAlias[target] || [];
  const propsToCheck = ["ADMIN", "NAME", "NAME_LONG", "BRK_NAME", "SOVEREIGNT", "FORMAL_EN"];

  for (const feat of countryGeoJson.features) {
    const props = feat.properties || {};
    const candidates = propsToCheck
      .map(k => props[k])
      .filter(Boolean)
      .map(norm);

    if (candidates.includes(target)) return feat;
    if (aliases.some(a => candidates.includes(norm(a)))) return feat;
  }

  console.warn("Country not found in GeoJSON for:", rawCode);
  return null;
}


    Promise.all([
        fetch('data/simulant.json').then(r=>r.json()),
        fetch('data/site.json').then(r=>r.json()),
        fetch('data/composition.json').then(r=>r.json()),
        fetch('data/chemical_composition.json').then(r=>r.json()),
        fetch('data/references.json').then(r=>r.json()),
        fetch('data/countries.geojson').then(r=>r.json())

    ]).then(([simData, siteData, minData, chemData, refData,geoData])=>{
        simulants = simData;
        sites = siteData;
        minerals = minData;
        chemicals = chemData;
        references = refData;
        countryGeoJson = geoData;

        populateFilters();
        updateMap();
    });

    function populateFilters(){
        const typeFilter = document.getElementById('type-filter');
        const countryFilter = document.getElementById('country-filter');
        const mineralFilter = document.getElementById('mineral-filter');
        const lrsDropdown = document.getElementById('lrs-dropdown');
        const chemicalFilter = document.getElementById('chemical-filter');

        simulants.forEach(s=>{
            let opt = document.createElement('option');
            opt.value = s.simulant_id;
            opt.text = s.name;
            lrsDropdown.appendChild(opt);
        });

        [...new Set(chemicals.map(c => c.component_name))].forEach(c => {
            if(!c) return;
            let opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            chemicalFilter.appendChild(opt);
        });
        [...new Set(simulants.map(s=>s.type))].forEach(t=>{
            let opt = document.createElement('option'); opt.value=t; opt.text=t; typeFilter.appendChild(opt);
        });
        [...new Set(simulants.map(s=>s.country_code))].forEach(c=>{
            let opt = document.createElement('option'); opt.value=c; opt.text=c; countryFilter.appendChild(opt);
        });
        [...new Set(minerals.map(m=>m.component_name))].forEach(m=>{
            let opt = document.createElement('option'); opt.value=m; opt.text=m; mineralFilter.appendChild(opt);
        });

        typeFilter.addEventListener('change', updateMap);
        countryFilter.addEventListener('change', updateMap);
        mineralFilter.addEventListener('change', updateCharts);
        chemicalFilter.addEventListener('change', updateCharts);

        // Clear Filters button
        const clearBtn = document.getElementById('clear-filters');
        clearBtn.addEventListener('click', () => {
            // Reset all filter selects
            ['type-filter','country-filter','mineral-filter','chemical-filter'].forEach(id => {
                const select = document.getElementById(id);
                if(select) select.selectedIndex = -1; // deselect all
            });

            // Reset LRS dropdown
            const lrsDropdown = document.getElementById('lrs-dropdown');
            if(lrsDropdown) lrsDropdown.selectedIndex = -1;

            // Update map and charts
            updateMap();
            updateCharts();
        });


        lrsDropdown.addEventListener('change', () => {
            const selected = lrsDropdown.value;
            if(selected) showInfo(selected, true, true); // center + open popup
        });
    }

    function highlightCountry(countryCode) {
    if (!countryGeoJson || !countryCode) return;

    if (countryLayer) map.removeLayer(countryLayer);

    let featuresToHighlight = [];

    if (countryCode === "EU") {
        const euCountries = ["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA",
                             "DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
                             "POL","PRT","ROU","SVK","SVN","ESP","SWE"];
        featuresToHighlight = countryGeoJson.features.filter(f =>
            euCountries.includes(f.properties.iso_a3)
        );
    } else {
        const code = countryMap[countryCode] || countryCode;
        const feat = countryGeoJson.features.find(f =>
            f.properties.iso_a3 === code || f.properties.iso_a2 === code
        );
        if (feat) featuresToHighlight.push(feat);
    }

    if (featuresToHighlight.length > 0) {
        countryLayer = L.geoJSON(featuresToHighlight, {
            style: { color: "#d33", weight: 2, fillColor: "#f39c12", fillOpacity: 0.15 }
        }).addTo(map);
        countryLayer.bringToFront();
        map.fitBounds(countryLayer.getBounds(), {padding:[20,20]});
    }
}


function updateCharts() {
    const mineralFilterValues = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o => o.value);
    const chemicalFilterValues = Array.from(document.getElementById('chemical-filter').selectedOptions).map(o => o.value);
    const minCtx = document.getElementById('mineral-chart').getContext('2d');
    const chemCtx = document.getElementById('chemical-chart').getContext('2d');

    // --- Mineral chart ---
    if (mineralChart) mineralChart.destroy();
    if (mineralFilterValues.length > 0) {
        const histData = simulants.map(s => {
            const m = minerals.find(m => m.simulant_id === s.simulant_id && mineralFilterValues.includes(m.component_name));
            return m ? { name: s.name, value: m.value_pct } : null;
        }).filter(Boolean);

        mineralChart = new Chart(minCtx, {
            type: 'bar',
            data: {
                labels: histData.map(d => d.name),
                datasets: [{
                    label: 'Mineral %',
                    data: histData.map(d => d.value),
                    backgroundColor: 'rgba(75,192,192,0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100 }, y: { ticks: { autoSkip: false } } }
            }
        });
    } else {
        minCtx.clearRect(0, 0, minCtx.canvas.width, minCtx.canvas.height);
    }

    // --- Chemical chart ---
    if (chemicalChart) chemicalChart.destroy();
    if (chemicalFilterValues.length > 0) {
        const chemData = simulants.map(s => {
            const c = chemicals.filter(c => c.simulant_id === s.simulant_id && chemicalFilterValues.includes(c.component_name));
            const total = c.reduce((sum, item) => sum + item.value_wt_pct, 0);
            return total > 0 ? { name: s.name, value: total } : null;
        }).filter(Boolean);

        chemicalChart = new Chart(chemCtx, {
            type: 'bar',
            data: {
                labels: chemData.map(d => d.name),
                datasets: [{
                    label: 'Chemical %',
                    data: chemData.map(d => d.value),
                    backgroundColor: 'rgba(255,99,132,0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100 }, y: { ticks: { autoSkip: false } } }
            }
        });
    } else {
        chemCtx.clearRect(0, 0, chemCtx.canvas.width, chemCtx.canvas.height);
    }
}



    function updateMap(){
        markers.clearLayers();
        markerMap = {};

        const typeFilter = Array.from(document.getElementById('type-filter').selectedOptions).map(o=>o.value);
        const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o=>o.value);
        const mineralFilter = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o=>o.value);

        let filtered = simulants.filter(s=>{
            let keep=true;
            if(typeFilter.length) keep = keep && typeFilter.includes(s.type);
            if(countryFilter.length) keep = keep && countryFilter.includes(s.country_code);
            if(mineralFilter.length){
                let sMinerals = minerals.filter(m=>m.simulant_id===s.simulant_id).map(m=>m.component_name);
                keep = keep && mineralFilter.some(m=>sMinerals.includes(m));
            }
            return keep;
        });

        // --- Highlight country if a single country is selected ---
        if (countryFilter.length === 1) {
            highlightCountry(countryFilter[0]);
        } else if (countryLayer) {
            map.removeLayer(countryLayer); // remove highlight if multiple or none
        }

        filtered.forEach(s=>{
            let siteRows = sites.filter(site=>site.simulant_id===s.simulant_id);
            siteRows.forEach(site=>{
                let lat = site.lat || 0;
                let lon = site.lon || 0;

                let marker = L.marker([lat, lon], { icon: moonIcon });

                // Popup + Tooltip
                let popupContent = `<b>${s.name}</b><br>Type: ${s.type}<br>Country: ${s.country_code}`;
                marker.bindPopup(popupContent);
                marker.bindTooltip(s.name, {permanent:false, direction:"top"});

                marker.on('click', () => showInfo(s.simulant_id, false, false));
                markers.addLayer(marker);

                markerMap[s.simulant_id] = marker; // store reference
            });
        });
    }

    // Mapping between simulant country_code values and GeoJSON ISO_A3 codes
    const countryMap = {
        "USA": "USA",
        "UK": "GBR",
        "EU": "FRA",          // you may change this to a different EU state if desired
        "EU, Italy": "ITA",
        "China": "CHN",
        "Australia": "AUS",
        "Canada": "CAN",
        "Japan": "JPN",
        "South Korea": "KOR",
        "India": "IND",
        "Turkey": "TUR",
        "Thailand": "THA"
    };

    
function showInfo(simulant_id, centerMap = false, openPopup = false) {
  const s = simulants.find(x => x.simulant_id === simulant_id);
  if (!s) return;

  document.getElementById('lrs-dropdown').value = simulant_id;

  // --- Remove old country highlight ---
  if (countryLayer) map.removeLayer(countryLayer);

  // --- Determine which countries to highlight ---
  let featuresToHighlight = [];

  if (s.country_code === "EU") {
    // EU countries ISO_A3 codes
    const euCountries = ["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA",
                         "DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
                         "POL","PRT","ROU","SVK","SVN","ESP","SWE"];
    featuresToHighlight = countryGeoJson.features.filter(f =>
      euCountries.includes(f.properties.iso_a3)
    );
  } else {
    // map specific country
    const code = countryMap[s.country_code] || s.country_code;
    const feat = countryGeoJson.features.find(f =>
      f.properties.iso_a3 === code || f.properties.iso_a2 === code
    );
    if (feat) featuresToHighlight.push(feat);
  }

  // --- Add highlight layer ---
  if (featuresToHighlight.length > 0) {
    countryLayer = L.geoJSON(featuresToHighlight, {
      style: { color: "#d33", weight: 2, fillColor: "#f39c12", fillOpacity: 0.15 }
    }).addTo(map);
    countryLayer.bringToFront();

    if (centerMap) {
      if (s.country_code === "EU") {
        // center on France
        const france = featuresToHighlight.find(f => f.properties.iso_a3 === "FRA");
        if (france) map.fitBounds(L.geoJSON(france).getBounds(), {padding:[20,20]});
      } else {
        map.fitBounds(countryLayer.getBounds(), {padding:[20,20]});
      }
    }
  }

  // --- Center on exact site & open popup ---
  const site = sites.find(site => site.simulant_id === simulant_id);
  if (site && site.lat && site.lon) {
    if (centerMap) setTimeout(() => map.flyTo([site.lat, site.lon], 7), 250);
    if (openPopup && markerMap[simulant_id]) markerMap[simulant_id].openPopup();
  }

  // ----- Charts and references (same as before) -----
  const minSubset = minerals.filter(m => m.simulant_id === simulant_id && m.value_pct > 0)
                            .sort((a,b) => b.value_pct - a.value_pct);
  const mineralCtx = document.getElementById('mineral-chart').getContext('2d');
  if (mineralChart) mineralChart.destroy();
  mineralChart = new Chart(mineralCtx, {
    type:'bar',
    data:{
      labels:minSubset.map(m=>m.component_name),
      datasets:[{label:'Mineral %',data:minSubset.map(m=>m.value_pct),backgroundColor:'rgba(75,192,192,0.7)'}]
    },
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100},y:{ticks:{autoSkip:false}}}}
  });

  const chemSubset = chemicals.filter(c =>
    c.simulant_id===simulant_id && c.component_type==='oxide' && c.component_name?.toLowerCase()!=='sum'
  );
  const chemicalCtx = document.getElementById('chemical-chart').getContext('2d');
  if (chemicalChart) chemicalChart.destroy();
  if (chemSubset.length===0){
    chemicalChart = new Chart(chemicalCtx,{type:'pie',data:{labels:['No Data'],datasets:[{data:[1],backgroundColor:['#ccc']}]},options:{plugins:{legend:{display:false}}}});
  } else {
    chemicalChart = new Chart(chemicalCtx,{
      type:'pie',
      data:{labels:chemSubset.map(c=>c.component_name),datasets:[{data:chemSubset.map(c=>c.value_wt_pct),backgroundColor:['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#C9CBCF','#E27D60']}]},
      options:{responsive:true,plugins:{legend:{position:'bottom'}}}
    });
  }

  const refPanel = document.getElementById('references-panel');
  refPanel.innerHTML = '';
  const refSubset = references.filter(r=>r.simulant_id===simulant_id);
  if(refSubset.length===0) refPanel.textContent='No references available';
  else refSubset.forEach(r=>{const div=document.createElement('div');div.textContent=r.reference_text;refPanel.appendChild(div)});
}

// --- Fly to default view (France) ---
function flyToDefault() {
    map.flyTo([46.6, 2.5], 3, { animate: true, duration: 1.5 });
    if (countryLayer) map.removeLayer(countryLayer); // remove highlight
}

// --- Clear Filters Button ---
const clearBtn = document.getElementById('clear-filters');
clearBtn.addEventListener('click', () => {
    ['type-filter','country-filter','mineral-filter','chemical-filter'].forEach(id => {
        const select = document.getElementById(id);
        if(select) select.selectedIndex = -1; // deselect all
    });
    const lrsDropdown = document.getElementById('lrs-dropdown');
    if(lrsDropdown) lrsDropdown.selectedIndex = -1;

    updateMap();
    updateCharts();

    // Fly to default view
    flyToDefault();
});

// --- Home Button ---
const homeBtn = document.getElementById('home-button');
homeBtn.addEventListener('click', () => {
    // Reset only the map view
    flyToDefault();
});


});

