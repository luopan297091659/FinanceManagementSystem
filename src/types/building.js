(function registerBuildingTypes(global) {
  /**
   * @typedef {"normal" | "warning" | "attention" | "critical" | "offline"} BuildingRiskLevel
   *
   * @typedef {Object} BuildingRecord
   * @property {string} id
   * @property {string} buildingName
   * @property {string} room
   * @property {string} tenant
   * @property {string} owner
   * @property {string} address
   * @property {string} postalCode
   * @property {string} phone
   * @property {string} contractNumber
   * @property {BuildingRiskLevel} riskLevel
   * @property {number} longitude
   * @property {number} latitude
   *
   * @typedef {Object} GisLayerState
   * @property {boolean} building
   * @property {boolean} risk
   * @property {boolean} heatmap
   */

  global.FmsGis = global.FmsGis || {};
})(window);
