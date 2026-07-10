(function registerBuildingSearch(global) {
  const SEARCH_FIELDS = [
    "buildingName",
    "room",
    "tenant",
    "owner",
    "address",
    "postalCode",
    "phone",
    "contractNumber",
  ];

  function normalizeSearchText(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase();
  }

  function getSearchText(feature) {
    const properties = feature.properties || {};
    return SEARCH_FIELDS.map((field) => normalizeSearchText(properties[field])).join(" ");
  }

  function createBuildingSearch(features) {
    const index = features.map((feature) => ({
      feature,
      text: getSearchText(feature),
    }));

    function search(query, limit = 10) {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return [];

      const results = [];
      index.forEach((item) => {
        if (item.text.includes(normalizedQuery) && results.length < limit) {
          results.push(item.feature);
        }
      });
      return results;
    }

    return { search };
  }

  function debounce(callback, delay) {
    let timerId;
    return function debouncedCallback(...args) {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => callback.apply(this, args), delay);
    };
  }

  global.FmsGis = global.FmsGis || {};
  global.FmsGis.useBuildingSearch = {
    createBuildingSearch,
    debounce,
  };
})(window);
