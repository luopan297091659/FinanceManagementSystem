(function registerSearchPanel(global) {
  function getProperty(feature, key) {
    return feature.properties?.[key] || "-";
  }

  function renderResultItem(feature, selectedId) {
    const featureId = String(feature.id || feature.properties.id);
    const selectedClass = featureId === selectedId ? " selected" : "";
    return `
      <button class="gis-result-item${selectedClass}" type="button" data-building-id="${featureId}">
        <span class="gis-result-title">${getProperty(feature, "buildingName")}</span>
        <span class="gis-result-grid">
          <span>Room ${getProperty(feature, "room")}</span>
          <span>Tenant ${getProperty(feature, "tenant")}</span>
          <span>Owner ${getProperty(feature, "owner")}</span>
          <span class="gis-risk ${getProperty(feature, "riskLevel")}">${getProperty(feature, "riskLevel")}</span>
        </span>
        <span class="gis-result-address">${getProperty(feature, "address")}</span>
      </button>
    `;
  }

  class SearchPanel {
    constructor(options) {
      this.container = options.container;
      this.map = options.map;
      this.buildingLayer = options.buildingLayer;
      this.features = options.features;
      this.searchEngine = global.FmsGis.useBuildingSearch.createBuildingSearch(this.features);
      this.results = [];
      this.selectedId = "";
      this.layerState = {
        building: true,
        risk: true,
        heatmap: false,
      };
      this.handleSearchInput = global.FmsGis.useBuildingSearch.debounce(() => this.runSearch(), 300);
    }

    mount() {
      this.container.innerHTML = `
        <div class="gis-search-card">
          <div class="gis-search-row">
            <input
              id="gis-search-input"
              class="gis-search-input"
              type="search"
              autocomplete="off"
              placeholder="Search by Building, Room, Tenant, Owner, Address, Postal Code, Phone, Contract"
            />
            <div class="gis-toolbar" aria-label="GIS search tools">
              <button class="gis-tool-button" type="button" data-gis-action="search" title="Search">Search</button>
              <button class="gis-tool-button" type="button" data-gis-action="clear" title="Clear">Clear</button>
              <button class="gis-tool-button" type="button" data-gis-action="locate" title="Locate Me">Locate</button>
              <button class="gis-tool-button" type="button" data-gis-action="toggle-layer-panel" title="Layer Switch">Layers</button>
            </div>
          </div>
          <div class="gis-layer-panel hidden" id="gis-layer-panel">
            <label class="gis-switch">
              <input type="checkbox" data-layer-switch="building" checked />
              <span>Building</span>
            </label>
            <label class="gis-switch">
              <input type="checkbox" data-layer-switch="risk" checked />
              <span>Risk</span>
            </label>
            <label class="gis-switch disabled">
              <input type="checkbox" data-layer-switch="heatmap" disabled />
              <span>Heatmap <small>Coming Sprint5</small></span>
            </label>
          </div>
          <div class="gis-results hidden" id="gis-search-results"></div>
        </div>
      `;

      this.input = this.container.querySelector("#gis-search-input");
      this.resultsContainer = this.container.querySelector("#gis-search-results");
      this.layerPanel = this.container.querySelector("#gis-layer-panel");
      this.bindEvents();
    }

    bindEvents() {
      this.input.addEventListener("input", this.handleSearchInput);
      this.container.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-gis-action]");
        if (actionButton) {
          this.handleToolbarAction(actionButton.dataset.gisAction);
          return;
        }

        const resultButton = event.target.closest("[data-building-id]");
        if (resultButton) {
          this.selectResult(resultButton.dataset.buildingId);
        }
      });

      this.container.addEventListener("change", (event) => {
        const switchInput = event.target.closest("[data-layer-switch]");
        if (switchInput) {
          this.toggleLayer(switchInput.dataset.layerSwitch, switchInput.checked);
        }
      });
    }

    handleToolbarAction(action) {
      if (action === "search") this.runSearch();
      if (action === "clear") this.clearSearch();
      if (action === "locate") this.locateMe();
      if (action === "toggle-layer-panel") this.layerPanel.classList.toggle("hidden");
    }

    runSearch() {
      const query = this.input.value;
      this.results = this.searchEngine.search(query, 10);

      if (!query.trim()) {
        this.results = [];
        this.selectedId = "";
        this.buildingLayer.clearFilter();
        this.renderResults();
        return;
      }

      this.buildingLayer.filterByFeatures(this.results);
      this.renderResults();
    }

    renderResults() {
      if (!this.results.length) {
        this.resultsContainer.classList.add("hidden");
        this.resultsContainer.innerHTML = "";
        return;
      }

      this.resultsContainer.classList.remove("hidden");
      this.resultsContainer.innerHTML = this.results.map((feature) => renderResultItem(feature, this.selectedId)).join("");
    }

    selectResult(featureId) {
      const feature = this.features.find((item) => String(item.id || item.properties.id) === String(featureId));
      if (!feature) return;

      this.selectedId = featureId;
      this.buildingLayer.highlightFeature(feature);
      this.renderResults();

      this.map.flyTo({
        center: feature.geometry.coordinates,
        zoom: 17,
        speed: 1.1,
        curve: 1.4,
        essential: true,
      });
    }

    clearSearch() {
      this.input.value = "";
      this.results = [];
      this.selectedId = "";
      this.buildingLayer.clearFilter();
      this.renderResults();
      this.input.focus();
    }

    locateMe() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((position) => {
        this.map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          essential: true,
        });
      });
    }

    toggleLayer(layerName, enabled) {
      this.layerState[layerName] = enabled;
      this.buildingLayer.setLayerState(this.layerState);
    }
  }

  global.FmsGis = global.FmsGis || {};
  global.FmsGis.SearchPanel = SearchPanel;
})(window);
