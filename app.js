document.addEventListener('DOMContentLoaded', () => {
    // Initialize map
    let map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView([46.6, 2.5], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Custom moon icon
    const moonIcon = L.icon({
        iconUrl: './img/moon.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });

    // Marker cluster
    let markers = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(markers);

    // Global state
    let countryLayer = null;
    let countryGeoJson = null;
    let simulants = [], sites = [], minerals = [], chemicals = [], references = [];
    let markerMap = {};
    let charts = {
        mineral1: null,
        chemical1: null,
        mineral2: null,
        chemical2: null
    };
    let panelStates = {
        panel1: { open: false, pinned: false, simulantId: null },
        panel2: { open: false, pinned: false, simulantId: null }
    };
    let compareMode = false;

    // Constants
    const euCountries = ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
        "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
        "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"];

    const countryMap = {
        "USA": "USA", "UK": "GBR", "EU": "EU", "France": "FRA",
        "Germany": "DEU", "Italy": "ITA", "China": "CHN",
        "Australia": "AUS", "Norway": "NOR", "Canada": "CAN",
        "Japan": "JPN", "South Korea": "KOR", "India": "IND",
        "Turkey": "TUR", "Thailand": "THA"
    };

    // Loading overlay
    function showLoading() {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p style="font-weight: 500; color: var(--text-secondary);">Loading lunar data...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.remove();
    }

    // Load data
    showLoading();
    Promise.all([
        fetch('./data/simulant.json').then(r => r.json()),
        fetch('./data/site.json').then(r => r.json()),
        fetch('./data/composition.json').then(r => r.json()),
        fetch('./data/chemical_composition.json').then(r => r.json()),
        fetch('./data/references.json').then(r => r.json()),
        fetch('./data/countries.geojson').then(r => r.json())
    ]).then(([simData, siteData, minData, chemData, refData, geoData]) => {
        simulants = simData;
        sites = siteData;
        minerals = minData;
        chemicals = chemData;
        references = refData;
        countryGeoJson = geoData;

        console.log('✓ Data loaded:', {
            simulants: simulants.length,
            sites: sites.length,
            minerals: minerals.length,
            chemicals: chemicals.length
        });

        hideLoading();
        populateFilters();
        updateMap();
        initializePanels();
        updateSimulantCount();
    }).catch(error => {
        hideLoading();
        console.error('Error loading data:', error);
        alert('Failed to load data. Check console for details.');
    });

    // Update simulant count dynamically
    function updateSimulantCount() {
        const typeFilter = Array.from(document.getElementById('type-filter').selectedOptions).map(o => o.value);
        const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o => o.value);
        const mineralFilter = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o => o.value);
        const chemicalFilter = Array.from(document.getElementById('chemical-filter').selectedOptions).map(o => o.value);

        let filtered = simulants.filter(s => {
            let keep = true;
            if (typeFilter.length) keep = keep && typeFilter.includes(s.type);
            if (countryFilter.length) keep = keep && countryFilter.includes(s.country_code);
            if (mineralFilter.length) {
                let sMinerals = minerals.filter(m => m.simulant_id === s.simulant_id).map(m => m.component_name);
                keep = keep && mineralFilter.some(m => sMinerals.includes(m));
            }
            if (chemicalFilter.length) {
                let sChemicals = chemicals.filter(c => c.simulant_id === s.simulant_id).map(c => c.component_name);
                keep = keep && chemicalFilter.some(c => sChemicals.includes(c));
            }
            return keep;
        });

        const countEl = document.getElementById('simulant-count');
        if (filtered.length === simulants.length) {
            countEl.textContent = `${simulants.length} simulants loaded`;
        } else {
            countEl.textContent = `${filtered.length} of ${simulants.length} simulants`;
        }
    }

    // Populate filters
    function populateFilters() {
        const lrsDropdown = document.getElementById('lrs-dropdown');
        const typeFilter = document.getElementById('type-filter');
        const countryFilter = document.getElementById('country-filter');
        const mineralFilter = document.getElementById('mineral-filter');
        const chemicalFilter = document.getElementById('chemical-filter');

        simulants.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.simulant_id;
            opt.text = s.name;
            lrsDropdown.appendChild(opt);
        });

        [...new Set(simulants.map(s => s.type).filter(Boolean))].sort().forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.text = t;
            typeFilter.appendChild(opt);
        });

        [...new Set(simulants.map(s => s.country_code).filter(Boolean))].sort().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            countryFilter.appendChild(opt);
        });

        [...new Set(minerals.map(m => m.component_name).filter(Boolean))].sort().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.text = m;
            mineralFilter.appendChild(opt);
        });

        [...new Set(chemicals.map(c => c.component_name).filter(Boolean))].sort().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            chemicalFilter.appendChild(opt);
        });

        // Event listeners for filters with toggle behavior
        [typeFilter, countryFilter, mineralFilter, chemicalFilter].forEach(filter => {
            filter.addEventListener('click', (e) => {
                if (e.target.tagName === 'OPTION') {
                    const option = e.target;
                    option.selected = !option.selected;
                    e.preventDefault();
                    updateMap();
                    updateSimulantCount();

                    // Update country panel if country filter changed
                    if (filter === countryFilter) {
                        updateCountryPanel();
                    }
                }
            });
        });

        // Select All buttons
        document.querySelectorAll('.select-all-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const select = document.getElementById(targetId);
                Array.from(select.options).forEach(opt => opt.selected = true);
                updateMap();
                updateSimulantCount();
                if (targetId === 'country-filter') {
                    updateCountryPanel();
                }
            });
        });

        lrsDropdown.addEventListener('change', () => {
            const selected = lrsDropdown.value;
            if (selected) {
                if (compareMode && panelStates.panel2.open) {
                    showInfo(selected, 2, true, true);
                } else {
                    showInfo(selected, 1, true, true);
                }
            }
        });
    }

    // Initialize panel interactions
    function initializePanels() {
        // Panel handles
        document.querySelectorAll('.panel-handle').forEach(handle => {
            handle.addEventListener('click', () => {
                const panelNum = handle.dataset.panel;
                togglePanel(panelNum);
            });
        });

        // Close buttons
        document.querySelectorAll('.close-panel').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelNum = btn.dataset.panel;
                closePanel(panelNum);
            });
        });

        // Pin buttons
        document.getElementById('pin-panel-1').addEventListener('click', function () {
            panelStates.panel1.pinned = !panelStates.panel1.pinned;
            this.classList.toggle('active', panelStates.panel1.pinned);
            const panel = document.getElementById('info-panel-1');
            if (panelStates.panel1.pinned) {
                panel.classList.add('pinned');
            } else {
                panel.classList.remove('pinned');
            }
        });

        document.getElementById('pin-panel-2').addEventListener('click', function () {
            panelStates.panel2.pinned = !panelStates.panel2.pinned;
            this.classList.toggle('active', panelStates.panel2.pinned);
            const panel = document.getElementById('info-panel-2');
            if (panelStates.panel2.pinned) {
                panel.classList.add('pinned');
            } else {
                panel.classList.remove('pinned');
            }
        });

        // Compare buttons in panels
        document.getElementById('compare-btn-1').addEventListener('click', function () {
            if (!panelStates.panel1.simulantId) {
                alert('Please select a simulant first');
                return;
            }
            compareMode = !compareMode;
            this.classList.toggle('active', compareMode);

            if (compareMode) {
                document.getElementById('info-panel-1').classList.add('comparison-mode');
                document.getElementById('info-panel-2').style.display = 'flex';
                openPanel(2);
            } else {
                document.getElementById('info-panel-1').classList.remove('comparison-mode');
                closePanel(2);
                document.getElementById('info-panel-2').style.display = 'none';
            }
        });

        // Map interactions - minimize unpinned panels
        map.on('drag', () => {
            if (!panelStates.panel1.pinned && panelStates.panel1.open) {
                minimizePanel(1);
            }
            if (!panelStates.panel2.pinned && panelStates.panel2.open) {
                minimizePanel(2);
            }
        });

        map.on('zoomstart', () => {
            if (!panelStates.panel1.pinned && panelStates.panel1.open) {
                minimizePanel(1);
            }
            if (!panelStates.panel2.pinned && panelStates.panel2.open) {
                minimizePanel(2);
            }
        });

        // Country panel close button
        document.getElementById('close-country-panel').addEventListener('click', () => {
            document.getElementById('country-panel').classList.remove('open');
        });
    }

    function togglePanel(panelNum) {
        const state = panelStates[`panel${panelNum}`];
        if (state.open) {
            minimizePanel(panelNum);
        } else {
            openPanel(panelNum);
        }
    }

    function openPanel(panelNum) {
        const panel = document.getElementById(`info-panel-${panelNum}`);
        panel.classList.add('open');
        panelStates[`panel${panelNum}`].open = true;
    }

    function minimizePanel(panelNum) {
        const panel = document.getElementById(`info-panel-${panelNum}`);
        if (!panelStates[`panel${panelNum}`].pinned) {
            panel.classList.remove('open');
            panelStates[`panel${panelNum}`].open = false;
        }
    }

    function closePanel(panelNum) {
        const panel = document.getElementById(`info-panel-${panelNum}`);
        panel.classList.remove('open', 'pinned');
        panelStates[`panel${panelNum}`].open = false;
        panelStates[`panel${panelNum}`].pinned = false;
        panelStates[`panel${panelNum}`].simulantId = null;

        document.getElementById(`pin-panel-${panelNum}`).classList.remove('active');

        document.querySelector(`#info-panel-${panelNum} .panel-title`).textContent =
            panelNum === '1' ? 'Select a simulant' : 'Select second simulant';
        document.getElementById(`references-panel-${panelNum}`).innerHTML =
            '<p class="placeholder-text">Select a simulant to view references</p>';

        // If closing panel 1 and compare mode is on, turn it off
        if (panelNum === '1' && compareMode) {
            compareMode = false;
            document.getElementById('compare-btn-1').classList.remove('active');
            document.getElementById('info-panel-1').classList.remove('comparison-mode');
            closePanel(2);
            document.getElementById('info-panel-2').style.display = 'none';
        }
    }

    // Update country panel
    function updateCountryPanel() {
        const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o => o.value);
        const panel = document.getElementById('country-panel');
        const content = document.getElementById('country-panel-content');
        const title = document.getElementById('country-panel-title');

        if (countryFilter.length === 0) {
            panel.classList.remove('open');
            return;
        }

        if (countryFilter.length === 1) {
            title.textContent = `Simulants in ${countryFilter[0]}`;
        } else {
            title.textContent = `Simulants in ${countryFilter.length} Countries`;
        }

        const filtered = simulants.filter(s => countryFilter.includes(s.country_code));

        content.innerHTML = '';
        if (filtered.length === 0) {
            content.innerHTML = '<p class="placeholder-text">No simulants found</p>';
        } else {
            filtered.forEach(s => {
                const item = document.createElement('div');
                item.className = 'simulant-list-item';
                item.innerHTML = `
                    <div class="simulant-list-item-name">${s.name}</div>
                    <div class="simulant-list-item-type">${s.type || 'N/A'}</div>
                `;
                item.addEventListener('click', () => {
                    showInfo(s.simulant_id, compareMode && panelStates.panel1.simulantId ? 2 : 1, true, true);
                });
                content.appendChild(item);
            });
        }

        panel.classList.add('open');
    }

    // Update map
    function updateMap() {
        markers.clearLayers();
        markerMap = {};

        const typeFilter = Array.from(document.getElementById('type-filter').selectedOptions).map(o => o.value);
        const countryFilter = Array.from(document.getElementById('country-filter').selectedOptions).map(o => o.value);
        const mineralFilter = Array.from(document.getElementById('mineral-filter').selectedOptions).map(o => o.value);
        const chemicalFilter = Array.from(document.getElementById('chemical-filter').selectedOptions).map(o => o.value);

        let filtered = simulants.filter(s => {
            let keep = true;
            if (typeFilter.length) keep = keep && typeFilter.includes(s.type);
            if (countryFilter.length) keep = keep && countryFilter.includes(s.country_code);
            if (mineralFilter.length) {
                let sMinerals = minerals.filter(m => m.simulant_id === s.simulant_id).map(m => m.component_name);
                keep = keep && mineralFilter.some(m => sMinerals.includes(m));
            }
            if (chemicalFilter.length) {
                let sChemicals = chemicals.filter(c => c.simulant_id === s.simulant_id).map(c => c.component_name);
                keep = keep && chemicalFilter.some(c => sChemicals.includes(c));
            }
            return keep;
        });

        if (countryFilter.length === 1) {
            highlightCountry(countryFilter[0]);
        } else if (countryLayer) {
            map.removeLayer(countryLayer);
        }

        filtered.forEach(s => {
            let siteRows = sites.filter(site => site.simulant_id === s.simulant_id);
            siteRows.forEach(site => {
                let lat = parseFloat(site.lat) || 0;
                let lon = parseFloat(site.lon) || 0;

                if (lat === 0 && lon === 0) return;

                let marker = L.marker([lat, lon], { icon: moonIcon });
                let popupContent = `<b>${s.name}</b><br>Type: ${s.type}<br>Country: ${s.country_code}`;
                marker.bindPopup(popupContent);
                marker.bindTooltip(s.name, { permanent: false, direction: "top" });

                marker.on('click', () => {
                    if (compareMode && panelStates.panel1.simulantId && !panelStates.panel2.simulantId) {
                        showInfo(s.simulant_id, 2, false, true);
                    } else {
                        showInfo(s.simulant_id, 1, false, true);
                    }
                });

                markers.addLayer(marker);
                markerMap[s.simulant_id] = marker;
            });
        });

        console.log(`Map updated: ${filtered.length} simulants`);
    }

    // Highlight country
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
                    color: "#667eea",
                    weight: 2,
                    fillColor: "#764ba2",
                    fillOpacity: 0.1
                }
            }).addTo(map);
            countryLayer.bringToFront();
        }
    }

    // Show simulant info
    function showInfo(simulant_id, panelNum = 1, centerMap = false, openPopup = false) {
        const s = simulants.find(x => x.simulant_id === simulant_id);
        if (!s) return;

        panelStates[`panel${panelNum}`].simulantId = simulant_id;

        document.querySelector(`#info-panel-${panelNum} .panel-title`).textContent = s.name;

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
                    color: "#667eea",
                    weight: 2,
                    fillColor: "#764ba2",
                    fillOpacity: 0.15
                }
            }).addTo(map);
            countryLayer.bringToFront();
        }

        const site = sites.find(site => site.simulant_id === simulant_id);
        if (site && site.lat && site.lon) {
            if (centerMap) {
                setTimeout(() => map.flyTo([site.lat, site.lon], 7), 250);
            }
            if (openPopup && markerMap[simulant_id]) {
                markerMap[simulant_id].openPopup();
            }
        }

        updateMineralChart(simulant_id, panelNum);
        updateChemicalChart(simulant_id, panelNum);
        updateReferences(simulant_id, panelNum);

        openPanel(panelNum);
    }

    function updateMineralChart(simulant_id, panelNum) {
        const chartKey = `mineral${panelNum}`;
        const ctx = document.getElementById(`mineral-chart-${panelNum}`).getContext('2d');

        if (charts[chartKey]) charts[chartKey].destroy();

        const minSubset = minerals.filter(m => m.simulant_id === simulant_id && m.value_pct > 0)
            .sort((a, b) => b.value_pct - a.value_pct);

        if (minSubset.length > 0) {
            charts[chartKey] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: minSubset.map(m => m.component_name),
                    datasets: [{
                        label: 'Mineral %',
                        data: minSubset.map(m => m.value_pct),
                        backgroundColor: 'rgba(102, 126, 234, 0.8)',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            cornerRadius: 8
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: 'rgba(0, 0, 0, 0.05)' }
                        },
                        y: {
                            ticks: { autoSkip: false, font: { size: 11 } },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }

    function updateChemicalChart(simulant_id, panelNum) {
        const chartKey = `chemical${panelNum}`;
        const ctx = document.getElementById(`chemical-chart-${panelNum}`).getContext('2d');

        if (charts[chartKey]) charts[chartKey].destroy();

        const chemSubset = chemicals.filter(c =>
            c.simulant_id === simulant_id &&
            c.component_type === 'oxide' &&
            c.component_name?.toLowerCase() !== 'sum'
        );

        if (chemSubset.length === 0) {
            charts[chartKey] = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#e2e8f0']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        } else {
            charts[chartKey] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chemSubset.map(c => c.component_name),
                    datasets: [{
                        data: chemSubset.map(c => c.value_wt_pct),
                        backgroundColor: [
                            '#667eea', '#764ba2', '#f093fb', '#4facfe',
                            '#43e97b', '#fa709a', '#fee140', '#30cfd0'
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 10,
                                font: { size: 11 },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            cornerRadius: 8
                        }
                    }
                }
            });
        }
    }

    function updateReferences(simulant_id, panelNum) {
        const refPanel = document.getElementById(`references-panel-${panelNum}`);
        refPanel.innerHTML = '';

        const refSubset = references.filter(r => r.simulant_id === simulant_id);

        if (refSubset.length === 0) {
            refPanel.innerHTML = '<p class="placeholder-text">No references available</p>';
        } else {
            refSubset.forEach(r => {
                const div = document.createElement('div');
                div.textContent = r.reference_text;
                refPanel.appendChild(div);
            });
        }
    }

    // Clear filters and navigate home
    document.getElementById('clear-filters').addEventListener('click', () => {
        ['type-filter', 'country-filter', 'mineral-filter', 'chemical-filter'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                Array.from(select.options).forEach(opt => opt.selected = false);
            }
        });
        document.getElementById('lrs-dropdown').selectedIndex = 0;

        // Close country panel
        document.getElementById('country-panel').classList.remove('open');

        updateMap();
        updateSimulantCount();
        map.flyTo([46.6, 2.5], 3, { animate: true, duration: 1.5 });
        if (countryLayer) map.removeLayer(countryLayer);
    });

    // Home button
    document.getElementById('home-button').addEventListener('click', () => {
        map.flyTo([46.6, 2.5], 3, { animate: true, duration: 1.5 });
        if (countryLayer) map.removeLayer(countryLayer);
    });
});