(function registerBuildingLayer(global) {
  const SOURCE_ID = "gis-buildings";
  const LAYER_ID = "gis-building-markers";

  class BuildingLayer {
    constructor(map) {
      this.map = map;
      this.featureCollection = {
        type: "FeatureCollection",
        features: [],
      };
      this.markerManager = new global.FmsGis.MarkerManager(map, SOURCE_ID, LAYER_ID);
    }

    async load() {
      this.featureCollection = await global.FmsGis.BuildingService.fetchBuildings();
      this.addSourceAndLayer();
      this.markerManager.setFeatureIds(this.getFeatureIds());
      return this.featureCollection;
    }

    addSourceAndLayer() {
      if (this.map.getSource(SOURCE_ID)) {
        this.map.getSource(SOURCE_ID).setData(this.featureCollection);
        return;
      }

      this.map.addSource(SOURCE_ID, {
        type: "geojson",
        data: this.featureCollection,
        promoteId: "id",
      });

      this.map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": global.FmsGis.createRiskColorExpression(),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            6,
            13,
            9,
            17,
            ["case", ["boolean", ["feature-state", "selected"], false], 18, 13],
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            ["boolean", ["feature-state", "matched"], true],
            0.94,
            0.25,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#111827",
            "#ffffff",
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            4,
            2,
          ],
        },
      });
    }

    getFeatures() {
      return this.featureCollection.features;
    }

    getFeatureIds() {
      return this.getFeatures().map((feature) => String(feature.id || feature.properties.id));
    }

    filterByFeatures(features) {
      this.markerManager.setMatchedIds(features.map((feature) => String(feature.id || feature.properties.id)));
    }

    clearFilter() {
      this.markerManager.clearSearchState();
    }

    highlightFeature(feature) {
      const featureId = String(feature.id || feature.properties.id);
      this.markerManager.selectFeature(featureId);
    }

    setLayerState(layerState) {
      this.markerManager.setLayerState(layerState);
    }
  }

  global.FmsGis = global.FmsGis || {};
  global.FmsGis.BuildingLayer = BuildingLayer;
})(window);
