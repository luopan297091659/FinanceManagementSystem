(function registerBuildingService(global) {
  const MOCK_BUILDINGS = [
    {
      id: "bldg-osaka-umeda",
      buildingName: "梅田フロントビル",
      room: "1201",
      tenant: "山田 太郎",
      owner: "ABC株式会社",
      address: "大阪府大阪市北区梅田3-1-1",
      postalCode: "530-0001",
      phone: "06-6341-0001",
      contractNumber: "CTR-OSK-1201",
      riskLevel: "normal",
      longitude: 135.495951,
      latitude: 34.702485,
    },
    {
      id: "bldg-namba",
      buildingName: "難波サウスタワー",
      room: "808",
      tenant: "王 小明",
      owner: "大阪住建",
      address: "大阪府大阪市中央区難波5-1-60",
      postalCode: "542-0076",
      phone: "06-6644-0808",
      contractNumber: "CTR-NMB-0808",
      riskLevel: "warning",
      longitude: 135.501185,
      latitude: 34.66627,
    },
    {
      id: "bldg-tennoji",
      buildingName: "天王寺レジデンス",
      room: "305",
      tenant: "佐藤 花子",
      owner: "李 明",
      address: "大阪府大阪市阿倍野区阿倍野筋1-1-43",
      postalCode: "545-0052",
      phone: "06-6624-0305",
      contractNumber: "CTR-TNJ-0305",
      riskLevel: "attention",
      longitude: 135.513474,
      latitude: 34.645161,
    },
    {
      id: "bldg-shin-osaka",
      buildingName: "新大阪ノースゲート",
      room: "1502",
      tenant: "Global Trade Ltd.",
      owner: "中村 不動産",
      address: "大阪府大阪市淀川区西中島5-16-1",
      postalCode: "532-0011",
      phone: "06-6300-1502",
      contractNumber: "CTR-SOS-1502",
      riskLevel: "critical",
      longitude: 135.500197,
      latitude: 34.73348,
    },
    {
      id: "bldg-suminoe",
      buildingName: "住之江ベイコート",
      room: "602",
      tenant: "张 伟",
      owner: "Bay Asset Japan",
      address: "大阪府大阪市住之江区南港北1-14-16",
      postalCode: "559-0034",
      phone: "06-6615-0602",
      contractNumber: "CTR-SME-0602",
      riskLevel: "offline",
      longitude: 135.414235,
      latitude: 34.638255,
    },
    {
      id: "bldg-kyobashi",
      buildingName: "京橋イースト",
      room: "1006",
      tenant: "Tanaka Holdings",
      owner: "森本 一郎",
      address: "大阪府大阪市都島区東野田町2-1-38",
      postalCode: "534-0024",
      phone: "06-6353-1006",
      contractNumber: "CTR-KYB-1006",
      riskLevel: "normal",
      longitude: 135.533689,
      latitude: 34.697266,
    },
  ];

  function normalizeFeature(record) {
    return {
      type: "Feature",
      id: record.id,
      geometry: {
        type: "Point",
        coordinates: [record.longitude, record.latitude],
      },
      properties: {
        id: record.id,
        buildingName: record.buildingName,
        room: record.room,
        tenant: record.tenant,
        owner: record.owner,
        address: record.address,
        postalCode: record.postalCode,
        phone: record.phone,
        contractNumber: record.contractNumber,
        riskLevel: record.riskLevel,
      },
    };
  }

  function toFeatureCollection(records) {
    return {
      type: "FeatureCollection",
      features: records.map(normalizeFeature),
    };
  }

  async function fetchBuildings() {
    try {
      const response = await fetch("/api/gis/buildings");
      if (!response.ok) throw new Error("GIS buildings API unavailable");
      const payload = await response.json();
      if (payload.type === "FeatureCollection") return payload;
      return toFeatureCollection(payload);
    } catch {
      return toFeatureCollection(MOCK_BUILDINGS);
    }
  }

  global.FmsGis = global.FmsGis || {};
  global.FmsGis.BuildingService = {
    fetchBuildings,
    toFeatureCollection,
  };
})(window);
