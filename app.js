document.addEventListener('DOMContentLoaded', () => {
    // Initialize map
    let map = L.map('map').setView([46.6, 2.5], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Custom marker icon (using default Leaflet marker)
    const moonIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    // Initialize marker cluster group
    let markers = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(markers);

    // Global variables
    let countryLayer = null;
    let countryGeoJson = null;
    let simulants = [], sites = [], minerals = [], chemicals = [], references = [];
    let mineralChart = null;
    let chemicalChart = null;
    let markerMap = {};

    // EU countries ISO3 codes
    const euCountries = ["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA",
                         "DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
                         "POL","PRT","ROU","SVK","SVN","ESP","SWE"];

    // Country code mapping
    const countryMap = {
        "USA": "USA",
        "UK": "GBR",
        "EU": "EU",
        "France": "FRA",
        "Germany": "DEU",
        "Italy": "ITA",
        "China": "CHN",
        "Australia": "AUS",
        "Norway": "NOR",
        "Canada": "CAN",
        "Japan": "JPN",
        "South Korea": "KOR",
        "India": "IND",
        "Turkey": "TUR",
        "Thailand": "THA"
    };

    // Show loading indicator
    function showLoading() {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.id = 'loading-indicator';
        loading.textContent = 'Loading data...';
        document.body.appendChild(loading);
    }

    function hideLoading() {
        const loading = document.getElementById('loading-indicator');
        if (loading) loading.remove();
    }

    // Load all data
    showLoading();
    Promise.all([
        fetch('./data/simulant.json').then(r => {
            if (!r.ok) throw new Error(`Failed to load simulant.json: ${r.status}`);
            return r.json();
        }),
        fetch('./data/site.json').then(r => {
            if (!r.ok) throw new Error(`Failed to load site.json: ${r.status}`);
            return r.json();
        }),
        fetch('./data/composition.json').then(r => {
            if (!r.ok) throw new Error(`Failed to load composition.json: ${r.status}`);
            return r.json();
        }),
        fetch('./data/chemical_composition.json').then(r => {
            if (!r.ok) throw new Error(`Failed to load chemical_composition.json: ${r.status}`);
            return r.json();
        }),
        fetch('./data/references.json').then(r => {
            if (!r.ok) throw new Error(`Failed to load references.json: ${r.status}`);
            return r.json();
        }),
        fetch('./data/countries.geojson').then(r => {
            if (!r.ok) throw new Error(`Failed to load countries.geojson: ${r.status}`);
            return r.json();
        })
    ]).then(([simData, siteData, minData, chemData, refData, geoData]) => {
        simulants = simData;
        sites = siteData;
        minerals = minData;
        chemicals = chemData;
        references = refData;
        countryGeoJson = geoData;

        console.log('✓ Data loaded successfully:', {
            simulants: simulants.length,
            sites: sites.length,
            minerals: minerals.length,
            chemicals: chemicals.length,
            references: references.length,
            countries: countryGeoJson.features.length
        });

        hideLoading();
        populateFilters();
        updateMap();
    }).catch(error => {
        hideLoading();
        console.error('❌ Error loading data:', error);
        alert(`Failed to load data: ${error.message}\n\nPlease check:\n1. All JSON files exist in the 'data' folder\n2. File names match exactly\n3. Browser console for details`);
    });

    // Populate filter dropdowns
    function populateFilters() {
        const typeFilter = document.getElementById('type-filter');
        const countryFilter = document.getElementById('country-filter');
        const mineralFilter = document.getElementById('mineral-filter');
        const lrsDropdown = document.getElementById('lrs-dropdown');
        const chemicalFilter = document.getElementById('chemical-filter');

        // Populate LRS dropdown
        simulants.forEach(s => {
            let opt = document.createElement('option');
            opt.value = s.simulant_id;
            opt.text = s.name;
            lrsDropdown.appendChild(opt);
        });

        // Populate chemical filter
        [...new Set(chemicals.map(c => c.component_name).filter(Boolean))].sort().forEach(c => {
            let opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            chemicalFilter.appendChild(opt);
        });

        // Populate type filter
        [...new Set(simulants.map(s => s.type).filter(Boolean))].sort().forEach(t => {
            let opt = document.createElement('option');
            opt.value = t;
            opt.text = t;
            typeFilter.appendChild(opt);
        });

        // Populate country filter
        [...new Set(simulants.map(s => s.country_code).filter(Boolean))].sort().forEach(c => {
            let opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            countryFilter.appendChild(opt);
        });

        // Populate mineral filter
        [...new Set(minerals.map(m => m.component_name).filter(Boolean))].sort().forEach(m => {
            let opt = document.createElement('option');
            opt.value = m;
            opt.text = m;
            mineralFilter.appendChild(opt);
        });

        // Add event listeners
        typeFilter.addEventListener('change', updateMap);
        countryFilter.addEventListener('change', updateMap);
        mineralFilter.addEventListener('change', updateCharts);
        chemicalFilter.addEventListener('change', updateCharts);

        lrsDropdown.addEventListener('change', () => {
            const selected = lrsDropdown.value;
            if (selected) showInfo(selected, true, true);
        });
    }

    // Highlight country on map
    function highlightCountry(countryCode) {
        if (!countryGeoJson || !countryCode) return;

        if (countryLayer) map.removeLayer(countryLayer);

        let featuresToHighlight = [];

        if (countryCode === "EU") {
            featuresToHighlight = countryGeoJson.features.filter(f =>
                euCountries.includes(f.properties.iso_a3 || f.properties.ISO_A3)
            );
        } else {
            const code = countryMap[countryCode] || countryCode;
            const feat = countryGeoJson.features.find(f =>
                (f.properties.iso_a3 || f.properties.ISO_A3) === code ||
                (f.properties.iso_a2 || f.properties.ISO_A2) === code
            );
            if (feat) featuresToHighlight.push(feat);
        }

        if (featuresToHighlight.length > 0) {
            countryLayer = L.geoJSON(featuresToHighlight, {
                style: {
                    color: "#d33",
                    weight: 2,
                    fillColor: "#f39c12",
                    fillOpacity: 0.15
                }
            }).addTo(map);
            countryLayer.bringToFront();
            map.fitBounds(countryLayer.getBounds(), { padding: [20, 20] });
        }
    }

    // Update charts based on filters
    function updateCharts() {
        const mineralFilterValues = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o => o.value);
        const chemicalFilterValues = Array.from(document.getElementById('chemical-filter').selectedOptions).map(o => o.value);
        const minCtx = document.getElementById('mineral-chart').getContext('2d');
        const chemCtx = document.getElementById('chemical-chart').getContext('2d');

        // Mineral chart
        if (mineralChart) mineralChart.destroy();
        if (mineralFilterValues.length > 0) {
            const histData = simulants.map(s => {
                const m = minerals.find(m => m.simulant_id === s.simulant_id && mineralFilterValues.includes(m.component_name));
                return m ? { name: s.name, value: m.value_pct } : null;
            }).filter(Boolean);

            if (histData.length > 0) {
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
                        scales: {
                            x: { beginAtZero: true, max: 100 },
                            y: { ticks: { autoSkip: false } }
                        }
                    }
                });
            }
        }

        // Chemical chart
        if (chemicalChart) chemicalChart.destroy();
        if (chemicalFilterValues.length > 0) {
            const chemData = simulants.map(s => {
                const c = chemicals.filter(c => c.simulant_id === s.simulant_id && chemicalFilterValues.includes(c.component_name));
                const total = c.reduce((sum, item) => sum + (item.value_wt_pct || 0), 0);
                return total > 0 ? { name: s.name, value: total } : null;
            }).filter(Boolean);

            if (chemData.length > 0) {
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
                        scales: {
                            x: { beginAtZero: true, max: 100 },
                            y: { ticks: { autoSkip: false } }
                        }
                    }
                });
            }
        }
    }

    // Update map markers
    function updateMap() {
        markers.clearLayers();
        markerMap = {};

        const typeFilter = Array.from(document.getElementById('type-filter').selectedOptions).map(o => o.value);
        const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o => o.value);
        const mineralFilter = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o => o.value);

        let filtered = simulants.filter(s => {
            let keep = true;
            if (typeFilter.length) keep = keep && typeFilter.includes(s.type);
            if (countryFilter.length) keep = keep && countryFilter.includes(s.country_code);
            if (mineralFilter.length) {
                let sMinerals = minerals.filter(m => m.simulant_id === s.simulant_id).map(m => m.component_name);
                keep = keep && mineralFilter.some(m => sMinerals.includes(m));
            }
            return keep;
        });

        // Highlight country if single country selected
        if (countryFilter.length === 1) {
            highlightCountry(countryFilter[0]);
        } else if (countryLayer) {
            map.removeLayer(countryLayer);
        }

        // Add markers
        filtered.forEach(s => {
            let siteRows = sites.filter(site => site.simulant_id === s.simulant_id);
            siteRows.forEach(site => {
                let lat = parseFloat(site.lat) || 0;
                let lon = parseFloat(site.lon) || 0;

                if (lat === 0 && lon === 0) return; // Skip invalid coordinates

                let marker = L.marker([lat, lon], { icon: moonIcon });

                let popupContent = `<b>${s.name}</b><br>Type: ${s.type}<br>Country: ${s.country_code}`;
                marker.bindPopup(popupContent);
                marker.bindTooltip(s.name, { permanent: false, direction: "top" });

                marker.on('click', () => showInfo(s.simulant_id, false, false));
                markers.addLayer(marker);

                markerMap[s.simulant_id] = marker;
            });
        });

        console.log(`Map updated: ${filtered.length} simulants, ${Object.keys(markerMap).length} markers`);
    }

    // Show detailed info for a simulant
    function showInfo(simulant_id, centerMap = false, openPopup = false) {
        const s = simulants.find(x => x.simulant_id === simulant_id);
        if (!s) return;

        document.getElementById('lrs-dropdown').value = simulant_id;

        if (countryLayer) map.removeLayer(countryLayer);

        let featuresToHighlight = [];

        if (s.country_code === "EU") {
            featuresToHighlight = countryGeoJson.features.filter(f =>
                euCountries.includes(f.properties.iso_a3 || f.properties.ISO_A3)
            );
        } else {
            const code = countryMap[s.country_code] || s.country_code;
            const feat = countryGeoJson.features.find(f =>
                (f.properties.iso_a3 || f.properties.ISO_A3) === code ||
                (f.properties.iso_a2 || f.properties.ISO_A2) === code
            );
            if (feat) featuresToHighlight.push(feat);
        }

        if (featuresToHighlight.length > 0) {
            countryLayer = L.geoJSON(featuresToHighlight, {
                style: {
                    color: "#d33",
                    weight: 2,
                    fillColor: "#f39c12",
                    fillOpacity: 0.15
                }
            }).addTo(map);
            countryLayer.bringToFront();
            if (centerMap) map.fitBounds(countryLayer.getBounds(), { padding: [20, 20] });
        }

        // Center on site
        const site = sites.find(site => site.simulant_id === simulant_id);
        if (site && site.lat && site.lon) {
            if (centerMap) setTimeout(() => map.flyTo([site.lat, site.lon], 7), 250);
            if (openPopup && markerMap[simulant_id]) markerMap[simulant_id].openPopup();
        }

        // Update mineral chart
        const minSubset = minerals.filter(m => m.simulant_id === simulant_id && m.value_pct > 0)
            .sort((a, b) => b.value_pct - a.value_pct);
        const mineralCtx = document.getElementById('mineral-chart').getContext('2d');
        if (mineralChart) mineralChart.destroy();
        
        if (minSubset.length > 0) {
            mineralChart = new Chart(mineralCtx, {
                type: 'bar',
                data: {
                    labels: minSubset.map(m => m.component_name),
                    datasets: [{
                        label: 'Mineral %',
                        data: minSubset.map(m => m.value_pct),
                        backgroundColor: 'rgba(75,192,192,0.7)'
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
        }

        // Update chemical chart
        const chemSubset = chemicals.filter(c =>
            c.simulant_id === simulant_id &&
            c.component_type === 'oxide' &&
            c.component_name?.toLowerCase() !== 'sum'
        );
        const chemicalCtx = document.getElementById('chemical-chart').getContext('2d');
        if (chemicalChart) chemicalChart.destroy();

        if (chemSubset.length === 0) {
            chemicalChart = new Chart(chemicalCtx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#ccc']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        } else {
            chemicalChart = new Chart(chemicalCtx, {
                type: 'pie',
                data: {
                    labels: chemSubset.map(c => c.component_name),
                    datasets: [{
                        data: chemSubset.map(c => c.value_wt_pct),
                        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#E27D60']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        // Update references
        const refPanel = document.getElementById('references-panel');
        refPanel.innerHTML = '';
        const refSubset = references.filter(r => r.simulant_id === simulant_id);
        if (refSubset.length === 0) {
            refPanel.textContent = 'No references available';
        } else {
            refSubset.forEach(r => {
                const div = document.createElement('div');
                div.textContent = r.reference_text;
                refPanel.appendChild(div);
            });
        }
    }

    // Reset map view
    function flyToDefault() {
        map.flyTo([46.6, 2.5], 3, { animate: true, duration: 1.5 });
        if (countryLayer) map.removeLayer(countryLayer);
    }

    // Clear filters button
    const clearBtn = document.getElementById('clear-filters');
    clearBtn.addEventListener('click', () => {
        ['type-filter', 'country-filter', 'mineral-filter', 'chemical-filter'].forEach(id => {
            const select = document.getElementById(id);
            if (select) select.selectedIndex = -1;
        });
        const lrsDropdown = document.getElementById('lrs-dropdown');
        if (lrsDropdown) lrsDropdown.selectedIndex = 0;

        updateMap();
        updateCharts();
        flyToDefault();
    });

    // Home button
    const homeBtn = document.getElementById('home-button');
    homeBtn.addEventListener('click', flyToDefault);
});
