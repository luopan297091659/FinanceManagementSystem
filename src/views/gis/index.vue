<template>
  <section class="gis-page" aria-label="GIS map">
    <div class="gis-header-card">
      <div>
        <p class="eyebrow">地图中心</p>
        <h2>物业位置与风险态势</h2>
      </div>
      <div class="gis-pill-group">
        <span class="gis-pill">{{ buildingCount }} 个资产点</span>
        <span class="gis-pill accent">{{ highlightedCount }} 个重点关注</span>
      </div>
    </div>

    <div class="gis-panel">
      <div class="gis-search-panel">
        <div class="gis-search-card">
          <div class="gis-search-row">
            <input
              v-model="query"
              class="gis-search-input"
              type="search"
              autocomplete="off"
              placeholder="搜索楼栋、房间、租客、业主或地址"
              @input="handleSearch"
              @keydown.enter.prevent="handleSearch"
            />
            <div class="gis-toolbar">
              <button class="gis-tool-button" type="button" @click="handleSearch">搜索</button>
              <button class="gis-tool-button" type="button" @click="clearSearch">清空</button>
            </div>
          </div>

          <div class="gis-layer-panel">
            <label class="gis-switch">
              <input v-model="layerState.building" type="checkbox" />
              <span>显示资产点</span>
            </label>
            <label class="gis-switch">
              <input v-model="layerState.risk" type="checkbox" />
              <span>显示风险色</span>
            </label>
          </div>

          <div v-if="results.length || hasSearched" class="gis-results">
            <div v-if="!results.length" class="gis-empty-state">没有匹配到相关资产，请尝试换个关键词。</div>
            <button
              v-for="item in results"
              v-else
              :key="item.id"
              class="gis-result-item"
              :class="{ selected: selectedId === item.id }"
              type="button"
              @click="focusBuilding(item)"
            >
              <span class="gis-result-title">{{ item.properties.buildingName }}</span>
              <span class="gis-result-grid">
                <span>Room {{ item.properties.room }}</span>
                <span>Tenant {{ item.properties.tenant }}</span>
                <span>Owner {{ item.properties.owner }}</span>
                <span class="gis-risk" :class="item.properties.riskLevel">{{ item.properties.riskLevel }}</span>
              </span>
              <span class="gis-result-address">{{ item.properties.address }}</span>
            </button>
          </div>
        </div>
      </div>

      <div ref="mapContainer" class="gis-map" />

      <aside v-if="activeProperty" class="gis-detail-card">
        <div class="gis-detail-header">
          <div>
            <p class="eyebrow">资产详情</p>
            <h3>{{ activeProperty.properties.buildingName }}</h3>
          </div>
          <button class="ghost-button mini" type="button" @click="closeDetail">关闭</button>
        </div>

        <div class="detail-grid">
          <div>
            <span class="detail-label">房间</span>
            <strong>{{ activeProperty.properties.room }}</strong>
          </div>
          <div>
            <span class="detail-label">租客</span>
            <strong>{{ activeProperty.properties.tenant }}</strong>
          </div>
          <div>
            <span class="detail-label">业主</span>
            <strong>{{ activeProperty.properties.owner }}</strong>
          </div>
          <div>
            <span class="detail-label">风险</span>
            <strong class="gis-risk" :class="activeProperty.properties.riskLevel">{{ activeProperty.properties.riskLevel }}</strong>
          </div>
        </div>

        <div class="detail-section">
          <p class="detail-label">地址</p>
          <p>{{ activeProperty.properties.address }}</p>
        </div>

        <div class="detail-section">
          <p class="detail-label">业务信息</p>
          <ul class="detail-list">
            <li>入金：{{ incomeSummary }}</li>
            <li>出金：{{ expenseSummary }}</li>
            <li>合同：{{ activeProperty.properties.contractNumber }}</li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "../../services/api";

const OSAKA_STATION = [135.495951, 34.702485];
const DEFAULT_ZOOM = 10;
const STYLE_URL = "https://api.maptiler.com/maps/jp-gsi-standard/style.json?key=z957GVzlIZ4zQdQ4as3E";

const mapContainer = ref(null);
const query = ref("");
const results = ref([]);
const hasSearched = ref(false);
const selectedId = ref("");
const activeProperty = ref(null);
const layerState = ref({ building: true, risk: true });
const buildingCount = ref(0);
const highlightedCount = ref(0);
let map;
let buildingLayer;
let hoverPopup = null;
let featureCollection = { type: "FeatureCollection", features: [] };

const RISK_COLORS = {
  normal: "#16a34a",
  warning: "#facc15",
  attention: "#f97316",
  critical: "#dc2626",
  offline: "#6b7280",
};

const createRiskColorExpression = () => [
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

const mockBuildings = [
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
  {
    id: "bldg-high-koribashi",
    buildingName: "東高麗橋商業ビル",
    room: "302",
    tenant: "高橋 佑介",
    owner: "中央区不動産",
    address: "大阪府大阪市中央区東高麗橋3-29",
    postalCode: "540-0021",
    phone: "06-1234-5678",
    contractNumber: "CTR-HKB-302",
    riskLevel: "warning",
    longitude: 135.517878,
    latitude: 34.682203,
  },
];

const normalizeSearchText = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-／・、。．()（）]/g, "");

const getRiskLevel = (status) => {
  if (status === "OVERDUE" || status === "MAINTENANCE") return "warning";
  if (status === "INACTIVE") return "offline";
  if (status === "OCCUPIED") return "attention";
  return "normal";
};

const buildFeatureCollection = (source = null) => {
  if (source && Array.isArray(source)) {
    return {
      type: "FeatureCollection",
      features: source.map((building) => ({
        type: "Feature",
        id: building.id,
        geometry: {
          type: "Point",
          coordinates: [building.longitude, building.latitude],
        },
        properties: {
          id: building.id,
          buildingName: building.buildingName,
          room: building.room,
          tenant: building.tenant,
          owner: building.owner,
          address: building.address,
          postalCode: building.postalCode,
          phone: building.phone,
          contractNumber: building.contractNumber,
          riskLevel: building.riskLevel,
        },
      })),
    };
  }

  return {
    type: "FeatureCollection",
    features: mockBuildings.map((building) => ({
      type: "Feature",
      id: building.id,
      geometry: {
        type: "Point",
        coordinates: [building.longitude, building.latitude],
      },
      properties: {
        id: building.id,
        buildingName: building.buildingName,
        room: building.room,
        tenant: building.tenant,
        owner: building.owner,
        address: building.address,
        postalCode: building.postalCode,
        phone: building.phone,
        contractNumber: building.contractNumber,
        riskLevel: building.riskLevel,
      },
    })),
  };
};

const buildBackendFeatureCollection = (payload) => {
  const buildingMap = new Map((payload?.buildings || []).map((building) => [building.id, building]));
  const tenantMap = new Map((payload?.tenants || []).map((tenant) => [tenant.id, tenant]));
  const ownerMap = new Map((payload?.owners || []).map((owner) => [owner.id, owner]));
  const roomTenantMap = new Map();
  const roomOwnerMap = new Map();

  for (const link of payload?.roomTenants || []) {
    if (!roomTenantMap.has(link.roomId) && link.status !== "ENDED") roomTenantMap.set(link.roomId, link);
  }
  for (const link of payload?.roomOwners || []) {
    if (!roomOwnerMap.has(link.roomId) && link.status !== "ENDED") roomOwnerMap.set(link.roomId, link);
  }

  const features = (payload?.rooms || [])
    .filter((room) => room.effectiveLatitude && room.effectiveLongitude)
    .map((room) => {
      const building = buildingMap.get(room.buildingId);
      const tenantLink = roomTenantMap.get(room.id);
      const ownerLink = roomOwnerMap.get(room.id);
      const tenant = tenantLink ? tenantMap.get(tenantLink.tenantId) : null;
      const owner = ownerLink ? ownerMap.get(ownerLink.ownerId) : null;
      return {
        type: "Feature",
        id: room.id,
        geometry: {
          type: "Point",
          coordinates: [Number(room.effectiveLongitude), Number(room.effectiveLatitude)],
        },
        properties: {
          id: room.id,
          buildingName: building?.name || room.houseNumber || "未命名资产",
          room: room.number || room.houseNumber,
          tenant: tenant?.name || "—",
          owner: owner?.name || "—",
          address: building?.name ? `${building.name} / ${room.houseNumber || room.number}` : room.houseNumber || room.number || "未登记地址",
          postalCode: "",
          phone: tenant?.phone || owner?.phone || "",
          contractNumber: "",
          riskLevel: getRiskLevel(room.status),
          status: room.status,
        },
      };
    });

  return { type: "FeatureCollection", features };
};

const filterResults = () => {
  const normalized = normalizeSearchText(query.value);
  hasSearched.value = true;

  if (!normalized) {
    results.value = [];
    return;
  }

  const matched = featureCollection.features.filter((feature) => {
    const properties = feature.properties || {};
    const haystack = [
      properties.buildingName,
      properties.room,
      properties.tenant,
      properties.owner,
      properties.address,
      properties.postalCode,
      properties.phone,
      properties.contractNumber,
    ]
      .filter(Boolean)
      .map((value) => normalizeSearchText(value))
      .join(" ");

    return haystack.includes(normalized);
  });

  results.value = matched.slice(0, 8);
};

const syncLayerState = () => {
  if (!map || !map.getLayer("gis-building-markers")) return;
  map.setLayoutProperty("gis-building-markers", "visibility", layerState.value.building ? "visible" : "none");
  map.setPaintProperty(
    "gis-building-markers",
    "circle-color",
    layerState.value.risk ? createRiskColorExpression() : RISK_COLORS.normal,
  );
};

const renderMapLayer = () => {
  if (!map) return;

  if (map.getSource("gis-buildings")) {
    map.getSource("gis-buildings").setData(featureCollection);
  } else {
    map.addSource("gis-buildings", {
      type: "geojson",
      data: featureCollection,
      promoteId: "id",
    });

    map.addLayer({
      id: "gis-building-markers",
      type: "circle",
      source: "gis-buildings",
      paint: {
        "circle-color": createRiskColorExpression(),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 13, 9, 17, 13],
        "circle-opacity": 0.95,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  syncLayerState();
};

const focusBuilding = (item) => {
  selectedId.value = item.id;
  activeProperty.value = item;
  map.flyTo({
    center: item.geometry.coordinates,
    zoom: 16,
    speed: 1.1,
    curve: 1.4,
    essential: true,
  });
};

const showHoverPopup = (feature, coordinates) => {
  if (!feature || !map) return;
  const props = feature.properties || {};
  const html = `
    <div class="gis-popup-card">
      <strong>${props.buildingName || "资产"}</strong>
      <div>房间：${props.room || "—"}</div>
      <div>租客：${props.tenant || "—"}</div>
      <div>业主：${props.owner || "—"}</div>
      <div>风险：${props.riskLevel || "normal"}</div>
    </div>
  `;

  if (!hoverPopup) {
    hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -12] });
  }

  hoverPopup.setLngLat(coordinates).setHTML(html).addTo(map);
};

const hideHoverPopup = () => {
  if (hoverPopup) {
    hoverPopup.remove();
    hoverPopup = null;
  }
};

const closeDetail = () => {
  activeProperty.value = null;
};

const handleSearch = () => {
  filterResults();
  const normalized = normalizeSearchText(query.value);
  if (!normalized) return;

  const addressMatch = featureCollection.features.find((feature) => normalizeSearchText(feature.properties?.address).includes(normalized));
  if (addressMatch) {
    focusBuilding(addressMatch);
  }
};

const clearSearch = () => {
  query.value = "";
  results.value = [];
  hasSearched.value = false;
  selectedId.value = "";
  activeProperty.value = null;
};

const syncFeatureStats = () => {
  buildingCount.value = featureCollection.features.length;
  highlightedCount.value = featureCollection.features.filter((item) => item.properties.riskLevel !== "normal").length;
};

const loadAssetData = async () => {
  try {
    const payload = await api.bootstrap();
    featureCollection = buildBackendFeatureCollection(payload);
  } catch (error) {
    featureCollection = buildFeatureCollection();
  }
  syncFeatureStats();
  if (map) {
    renderMapLayer();
  }
};

onMounted(() => {
  featureCollection = buildFeatureCollection();
  syncFeatureStats();

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: STYLE_URL,
    center: OSAKA_STATION,
    zoom: 10,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: "metric" }), "bottom-left");

  map.on("load", () => {
    loadAssetData();
  });

  map.on("mousemove", "gis-building-markers", (event) => {
    if (!event.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
    showHoverPopup(event.features[0], event.lngLat);
  });

  map.on("mouseleave", "gis-building-markers", () => {
    map.getCanvas().style.cursor = "";
    hideHoverPopup();
  });

  map.on("click", "gis-building-markers", (event) => {
    if (!event.features?.length) return;
    const feature = event.features[0];
    activeProperty.value = feature;
    selectedId.value = String(feature.id || feature.properties.id);
    hideHoverPopup();
    focusBuilding(feature);
  });
});

onBeforeUnmount(() => {
  hideHoverPopup();
  if (map) {
    map.remove();
    map = undefined;
  }
});

const incomeSummary = computed(() => (activeProperty.value ? "¥120,000" : "—"));
const expenseSummary = computed(() => (activeProperty.value ? "¥28,000" : "—"));
</script>

<style scoped>
.gis-page {
  display: grid;
  gap: 14px;
}

.gis-header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  background: linear-gradient(135deg, #f8fbff, #eef6f4);
}

.gis-header-card h2 {
  margin: 4px 0 0;
  font-size: 20px;
}

.gis-pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gis-pill {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 7px 10px;
  background: #fff;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.gis-pill.accent {
  border-color: #f59e0b;
  color: #b45309;
  background: #fff7ed;
}

.gis-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow);
  min-height: 680px;
}

.gis-map {
  width: 100%;
  height: 700px;
  min-height: 620px;
}

.gis-search-panel {
  position: absolute;
  z-index: 2;
  top: 16px;
  left: 16px;
  width: min(420px, calc(100% - 32px));
}

.gis-search-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.gis-search-row {
  display: flex;
  gap: 8px;
  padding: 10px;
}

.gis-search-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  background: #f9fbfd;
}

.gis-toolbar {
  display: flex;
  gap: 6px;
}

.gis-tool-button {
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
  font-weight: 700;
}

.gis-layer-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 10px 10px;
}

.gis-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.gis-results {
  max-height: 320px;
  overflow: auto;
  border-top: 1px solid var(--line);
}

.gis-empty-state {
  padding: 12px;
  color: var(--muted);
  font-size: 13px;
}

.gis-result-item {
  display: grid;
  gap: 6px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line);
  padding: 11px 12px;
  background: #fff;
  color: var(--text);
  text-align: left;
}

.gis-result-item:hover,
.gis-result-item.selected {
  background: #eef8f5;
}

.gis-result-title {
  font-size: 14px;
  font-weight: 800;
}

.gis-result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 10px;
  color: var(--muted);
  font-size: 12px;
}

.gis-result-address {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.gis-risk {
  width: fit-content;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 800;
  text-transform: capitalize;
}

.gis-risk.normal {
  background: #dcfce7;
  color: #166534;
}

.gis-risk.warning {
  background: #fef9c3;
  color: #854d0e;
}

.gis-risk.attention {
  background: #ffedd5;
  color: #9a3412;
}

.gis-risk.critical {
  background: #fee2e2;
  color: #991b1b;
}

.gis-risk.offline {
  background: #f3f4f6;
  color: #4b5563;
}

.gis-popup-card {
  display: grid;
  gap: 4px;
  min-width: 180px;
  padding: 8px 10px;
  color: var(--text);
  font-size: 12px;
}

.gis-popup-card strong {
  font-size: 13px;
}

@media (max-width: 720px) {
  .gis-header-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .gis-search-row {
    flex-direction: column;
  }

  .gis-toolbar {
    flex-wrap: wrap;
  }

  .gis-result-grid {
    grid-template-columns: 1fr;
  }
}
</style>
