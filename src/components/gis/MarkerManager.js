(function registerMarkerManager(global) {
  const RISK_COLORS = {
    normal: "#16a34a",
    warning: "#facc15",
    attention: "#f97316",
    critical: "#dc2626",
    offline: "#6b7280",
  };

  function createRiskColorExpression() {
    return [
      "match",
      ["get", "riskLevel"],
      "warning",
      RISK_COLORS.warning,
      "attention",
      RISK_COLORS.attention,
      "critical",
      RISK_COLORS.critical,
      "offline",
      RISK_COLORS.offline,
      RISK_COLORS.normal,
    ];
  }

  class MarkerManager {
    constructor(map, sourceId, layerId) {
      this.map = map;
      this.sourceId = sourceId;
      this.layerId = layerId;
      this.featureIds = [];
      this.matchedIds = new Set();
      this.selectedId = "";
      this.layerState = {
        building: true,
        risk: true,
        heatmap: false,
      };
      this.animationFrameId = 0;
    }

    setFeatureIds(featureIds) {
      this.featureIds = featureIds;
      this.matchedIds = new Set(featureIds);
      this.scheduleStateSync();
    }

    setMatchedIds(featureIds) {
      this.matchedIds = new Set(featureIds);
      this.scheduleStateSync();
    }

    clearSearchState() {
      this.matchedIds = new Set(this.featureIds);
      this.selectedId = "";
      this.scheduleStateSync();
    }

    selectFeature(featureId) {
      this.selectedId = featureId;
      this.scheduleStateSync();
    }

    setLayerState(nextState) {
      this.layerState = { ...this.layerState, ...nextState };
      this.updateLayerVisibility();
      this.updateRiskPaint();
    }

    scheduleStateSync() {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = window.requestAnimationFrame(() => this.syncFeatureStates());
    }

    syncFeatureStates() {
      this.featureIds.forEach((featureId) => {
        this.map.setFeatureState(
          { source: this.sourceId, id: featureId },
          {
            matched: this.matchedIds.has(featureId),
            selected: featureId === this.selectedId,
          },
        );
      });
    }

    updateLayerVisibility() {
      if (!this.map.getLayer(this.layerId)) return;
      this.map.setLayoutProperty(this.layerId, "visibility", this.layerState.building ? "visible" : "none");
    }

    updateRiskPaint() {
      if (!this.map.getLayer(this.layerId)) return;
      this.map.setPaintProperty(
        this.layerId,
        "circle-color",
        this.layerState.risk ? createRiskColorExpression() : RISK_COLORS.normal,
      );
    }
  }

  global.FmsGis = global.FmsGis || {};
  global.FmsGis.MarkerManager = MarkerManager;
  global.FmsGis.MarkerRiskColors = RISK_COLORS;
  global.FmsGis.createRiskColorExpression = createRiskColorExpression;
})(window);
