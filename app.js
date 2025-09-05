// document.addEventListener('DOMContentLoaded', () => {

//     let map = L.map('map').setView([46.6, 2.5], 3);
//     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);

//     let markers = L.markerClusterGroup();
//     map.addLayer(markers);

//     let simulants = [], sites = [], minerals = [], chemicals = [], references = [];

//     let mineralChart = null;
//     let chemicalChart = null;

//     Promise.all([
//         fetch('data/simulant.json').then(r=>r.json()),
//         fetch('data/site.json').then(r=>r.json()),
//         fetch('data/composition.json').then(r=>r.json()),
//         fetch('data/chemical_composition.json').then(r=>r.json()),
//         fetch('data/references.json').then(r=>r.json())
//     ]).then(([simData, siteData, minData, chemData, refData])=>{
//         simulants = simData;
//         sites = siteData;
//         minerals = minData;
//         chemicals = chemData;
//         references = refData;

//         populateFilters();
//         updateMap();
//     });

//     function populateFilters(){
//         const typeFilter = document.getElementById('type-filter');
//         const countryFilter = document.getElementById('country-filter');
//         const mineralFilter = document.getElementById('mineral-filter');
//         const lrsDropdown = document.getElementById('lrs-dropdown');

//         simulants.forEach(s=>{
//             let opt = document.createElement('option'); opt.value=s.simulant_id; opt.text=s.name; lrsDropdown.appendChild(opt);
//         });

//         [...new Set(simulants.map(s=>s.type))].forEach(t=>{
//             let opt = document.createElement('option'); opt.value=t; opt.text=t; typeFilter.appendChild(opt);
//         });
//         [...new Set(simulants.map(s=>s.country_code))].forEach(c=>{
//             let opt = document.createElement('option'); opt.value=c; opt.text=c; countryFilter.appendChild(opt);
//         });
//         [...new Set(minerals.map(m=>m.component_name))].forEach(m=>{
//             let opt = document.createElement('option'); opt.value=m; opt.text=m; mineralFilter.appendChild(opt);
//         });

//         typeFilter.addEventListener('change', updateMap);
//         countryFilter.addEventListener('change', updateMap);
//         mineralFilter.addEventListener('change', updateMap);

//         lrsDropdown.addEventListener('change', () => {
//             const selected = lrsDropdown.value;
//             if(selected) showInfo(selected, true);
//         });
//     }

//     function updateMap(){
//         markers.clearLayers();

//         const typeFilter = Array.from(document.getElementById('type-filter').selectedOptions).map(o=>o.value);
//         const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o=>o.value);
//         const mineralFilter = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o=>o.value);

//         let filtered = simulants.filter(s=>{
//             let keep=true;
//             if(typeFilter.length) keep = keep && typeFilter.includes(s.type);
//             if(countryFilter.length) keep = keep && countryFilter.includes(s.country_code);
//             if(mineralFilter.length){
//                 let sMinerals = minerals.filter(m=>m.simulant_id===s.simulant_id).map(m=>m.component_name);
//                 keep = keep && mineralFilter.some(m=>sMinerals.includes(m));
//             }
//             return keep;
//         });

//         filtered.forEach(s=>{
//             let siteRows = sites.filter(site=>site.simulant_id===s.simulant_id);
//             siteRows.forEach(site=>{
//                 let lat = site.lat || 0;
//                 let lon = site.lon || 0;
//                 let marker = L.marker([lat, lon]);
//                 marker.bindPopup(`${s.name} (${s.type})`);
//                 marker.on('click', () => showInfo(s.simulant_id, false, [lat, lon]));
//                 markers.addLayer(marker);
//             });
//         });
//     }

//     function showInfo(simulant_id, centerMap=false, coords=null){
//         const s = simulants.find(x=>x.simulant_id===simulant_id);
//         if(!s) return;

//         document.getElementById('lrs-dropdown').value = simulant_id;

//         // Center map if requested
//         if(centerMap){
//             let site = sites.find(site=>site.simulant_id===simulant_id);
//             if(site && site.lat && site.lon){
//                 map.flyTo([site.lat, site.lon], 7);
//             }
//         }

//         // ----- Mineral Chart -----
//         let minSubset = minerals.filter(m=>m.simulant_id===simulant_id);
//         let mineralCtx = document.getElementById('mineral-chart').getContext('2d');
//         if(mineralChart) mineralChart.destroy();
//         mineralChart = new Chart(mineralCtx, {
//             type: 'bar',
//             data: {
//                 labels: minSubset.map(m=>m.component_name),
//                 datasets: [{
//                     label: 'Mineral %',
//                     data: minSubset.map(m=>m.value_pct),
//                     backgroundColor: 'rgba(75, 192, 192, 0.7)'
//                 }]
//             },
//             options: {
//                 indexAxis: 'y',
//                 responsive: true,
//                 plugins: { legend: { display: false } },
//                 scales: { x: { beginAtZero: true, max: 100 } }
//             }
//         });

//         // ----- Chemical Chart -----
//         let chemSubset = chemicals.filter(c=>c.simulant_id===simulant_id && c.component_type==='oxide');
//         let chemicalCtx = document.getElementById('chemical-chart').getContext('2d');
//         if(chemicalChart) chemicalChart.destroy();
//         if(chemSubset.length===0){
//             chemicalChart = new Chart(chemicalCtx, {
//                 type: 'pie',
//                 data: {
//                     labels: ['No Data'],
//                     datasets: [{ data:[1], backgroundColor:['#ccc'] }]
//                 },
//                 options: { plugins: { legend:{ display:false } } }
//             });
//         } else {
//             chemicalChart = new Chart(chemicalCtx, {
//                 type: 'pie',
//                 data: {
//                     labels: chemSubset.map(c=>c.component_name),
//                     datasets: [{
//                         data: chemSubset.map(c=>c.value_wt_pct),
//                         backgroundColor: [
//                             '#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'
//                         ]
//                     }]
//                 },
//                 options: { responsive: true }
//             });
//         }

//         // ----- References -----
//         let refPanel = document.getElementById('references-panel');
//         refPanel.innerHTML = '';
//         let refSubset = references.filter(r=>r.simulant_id===simulant_id);
//         if(refSubset.length===0){
//             refPanel.textContent = 'No references available';
//         } else {
//             refSubset.forEach(r=>{
//                 let div = document.createElement('div');
//                 div.textContent = r.reference_text;
//                 refPanel.appendChild(div);
//             });
//         }
//     }

// });
document.addEventListener('DOMContentLoaded', () => {

    let map = L.map('map').setView([46.6, 2.5], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);

    let markers = L.markerClusterGroup();
    map.addLayer(markers);

    let simulants = [], sites = [], minerals = [], chemicals = [], references = [];
    let mineralChart = null;
    let chemicalChart = null;
    let markerMap = {}; // Map simulant_id -> marker

    Promise.all([
        fetch('data/simulant.json').then(r=>r.json()),
        fetch('data/site.json').then(r=>r.json()),
        fetch('data/composition.json').then(r=>r.json()),
        fetch('data/chemical_composition.json').then(r=>r.json()),
        fetch('data/references.json').then(r=>r.json())
    ]).then(([simData, siteData, minData, chemData, refData])=>{
        simulants = simData;
        sites = siteData;
        minerals = minData;
        chemicals = chemData;
        references = refData;

        populateFilters();
        updateMap();
    });

    function populateFilters(){
        const typeFilter = document.getElementById('type-filter');
        const countryFilter = document.getElementById('country-filter');
        const mineralFilter = document.getElementById('mineral-filter');
        const lrsDropdown = document.getElementById('lrs-dropdown');

        simulants.forEach(s=>{
            let opt = document.createElement('option');
            opt.value = s.simulant_id;
            opt.text = s.name;
            lrsDropdown.appendChild(opt);
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
        mineralFilter.addEventListener('change', updateMap);

        lrsDropdown.addEventListener('change', () => {
            const selected = lrsDropdown.value;
            if(selected) showInfo(selected, true, true); // center + open popup
        });
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

        filtered.forEach(s=>{
            let siteRows = sites.filter(site=>site.simulant_id===s.simulant_id);
            siteRows.forEach(site=>{
                let lat = site.lat || 0;
                let lon = site.lon || 0;

                let marker = L.marker([lat, lon]);

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

    function showInfo(simulant_id, centerMap=false, openPopup=false){
        const s = simulants.find(x=>x.simulant_id===simulant_id);
        if(!s) return;

        document.getElementById('lrs-dropdown').value = simulant_id;

        // Center and/or open popup
        let site = sites.find(site=>site.simulant_id===simulant_id);
        if(site && site.lat && site.lon){
            if(centerMap) map.flyTo([site.lat, site.lon], 7);
            if(openPopup && markerMap[simulant_id]) markerMap[simulant_id].openPopup();
        }

        // ----- Mineral Chart -----
        let minSubset = minerals.filter(m=>m.simulant_id===simulant_id);
        let mineralCtx = document.getElementById('mineral-chart').getContext('2d');
        if(mineralChart) mineralChart.destroy();
        mineralChart = new Chart(mineralCtx, {
            type: 'bar',
            data: {
                labels: minSubset.map(m=>m.component_name),
                datasets: [{
                    label: 'Mineral %',
                    data: minSubset.map(m=>m.value_pct),
                    backgroundColor: 'rgba(75, 192, 192, 0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, max: 100 },
                    y: { ticks: { autoSkip: false } }
                }
            }
        });

        // Make histogram taller
        // document.getElementById('mineral-chart').parentElement.style.height = "400px";

        
        // ----- Chemical Chart -----
        let chemSubset = chemicals.filter(c=>
            c.simulant_id===simulant_id &&
            c.component_type==='oxide' &&
            c.component_name.toLowerCase() !== 'sum'
        );
        let chemicalCtx = document.getElementById('chemical-chart').getContext('2d');
        if(chemicalChart) chemicalChart.destroy();
        if(chemSubset.length===0){
            chemicalChart = new Chart(chemicalCtx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{ data:[1], backgroundColor:['#ccc'] }]
                },
                options: { plugins: { legend:{ display:false } } }
            });
        } else {
            chemicalChart = new Chart(chemicalCtx, {
                type: 'pie',
                data: {
                    labels: chemSubset.map(c=>c.component_name),
                    datasets: [{
                        data: chemSubset.map(c=>c.value_wt_pct),
                        backgroundColor: [
                            '#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#C9CBCF','#E27D60'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        // ----- References -----
        let refPanel = document.getElementById('references-panel');
        refPanel.innerHTML = '';
        let refSubset = references.filter(r=>r.simulant_id===simulant_id);
        if(refSubset.length===0){
            refPanel.textContent = 'No references available';
        } else {
            refSubset.forEach(r=>{
                let div = document.createElement('div');
                div.textContent = r.reference_text;
                refPanel.appendChild(div);
            });
        }
    }

});
