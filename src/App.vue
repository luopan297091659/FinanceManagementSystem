<template>
  <div class="app-shell" :style="shellStyle">
    <aside class="sidebar" :style="sidebarStyle">
      <div class="brand">
        <span class="brand-mark" :style="brandStyle">F</span>
        <div>
          <strong>房产管理平台</strong>
          <small>Vue 3 迁移版</small>
        </div>
      </div>

      <nav class="nav" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeView === item.key }"
          type="button"
          @click="activeView = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="sidebar-card">
        <p class="eyebrow">当前进度</p>
        <h3>Vue 3 业务页面已接入</h3>
        <p>GIS、房源、客户与财务模块已经组件化，并支持主题色切换。</p>
      </div>

      <div class="theme-card">
        <p class="eyebrow">主题色</p>
        <div class="theme-swatches">
          <button v-for="theme in themes" :key="theme.key" class="swatch" :style="{ background: theme.color }" type="button" @click="setTheme(theme.key)" />
        </div>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">日本房产管理公司</p>
          <h1>{{ currentTitle }}</h1>
          <p class="subtle">{{ currentSubtitle }}</p>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" type="button" @click="activeView = 'gis'">查看 GIS</button>
          <button class="primary-button" type="button" @click="activeView = 'overview'">业务概览</button>
        </div>
      </header>

      <section v-if="activeView === 'overview'" class="overview-grid">
        <article class="metric-card">
          <span class="metric-label">资产点位</span>
          <strong class="metric-value">6</strong>
          <p>包含梅田、难波等重点物业。</p>
        </article>
        <article class="metric-card">
          <span class="metric-label">重点关注</span>
          <strong class="metric-value">4</strong>
          <p>风险等级为 warning / attention / critical 的资产。</p>
        </article>
        <article class="metric-card">
          <span class="metric-label">搜索体验</span>
          <strong class="metric-value">实时</strong>
          <p>支持楼栋、房间、租客、业主与地址检索。</p>
        </article>
      </section>

      <GisView v-else-if="activeView === 'gis'" />
      <ResourcesView v-else-if="activeView === 'resources'" />
      <CustomersView v-else-if="activeView === 'customers'" />
      <FinanceView v-else-if="activeView === 'finance'" />
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import GisView from "./views/gis/index.vue";
import ResourcesView from "./views/resources.vue";
import CustomersView from "./views/customers.vue";
import FinanceView from "./views/finance.vue";

const activeView = ref("gis");
const theme = ref("teal");
const navItems = [
  { key: "overview", label: "业务概览" },
  { key: "gis", label: "GIS 地图" },
  { key: "resources", label: "房源管理" },
  { key: "customers", label: "客户管理" },
  { key: "finance", label: "财务中心" },
];
const themes = [
  { key: "teal", label: "青绿", color: "#0f766e" },
  { key: "blue", label: "深蓝", color: "#2563eb" },
  { key: "purple", label: "紫罗兰", color: "#7c3aed" },
];

const palette = {
  teal: { primary: "#0f766e", accent: "#14b8a6", surface: "#17212b" },
  blue: { primary: "#2563eb", accent: "#38bdf8", surface: "#10233d" },
  purple: { primary: "#7c3aed", accent: "#a78bfa", surface: "#20123f" },
};

const shellStyle = computed(() => ({
  "--primary": palette[theme.value].primary,
  "--primary-strong": palette[theme.value].accent,
  "--sidebar-bg": palette[theme.value].surface,
}));

const sidebarStyle = computed(() => ({ background: palette[theme.value].surface }));
const brandStyle = computed(() => ({ background: palette[theme.value].primary }));

const currentTitle = computed(() => {
  const titleMap = { overview: "业务概览", gis: "GIS 地图中心", resources: "房源管理", customers: "客户管理", finance: "财务中心" };
  return titleMap[activeView.value] || "业务概览";
});

const currentSubtitle = computed(() => {
  const map = {
    overview: "汇总关键业务指标，快速掌握资产与风险状态。",
    gis: "整合地图、搜索、图层与风险状态，提供更直观的运营视图。",
    resources: "维护房屋、楼栋和房间状态，支撑日常运营。",
    customers: "统一管理租客、业主与相关业务联系人。",
    finance: "审查收支流水，辅助财务分析与预算控制。",
  };
  return map[activeView.value] || "";
});

const setTheme = (key) => {
  theme.value = key;
};
</script>

<style scoped>
.sidebar-card,
.theme-card {
  margin-top: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: #e5eef7;
}

.sidebar-card h3 {
  margin: 4px 0 8px;
  font-size: 16px;
}

.sidebar-card p,
.theme-card p {
  margin: 0;
  color: #b7c2ce;
  line-height: 1.6;
}

.theme-swatches {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.swatch {
  width: 28px;
  height: 28px;
  border: 2px solid #fff;
  border-radius: 999px;
  cursor: pointer;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.metric-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.metric-label {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 8px;
}

.metric-value {
  display: block;
  font-size: 30px;
  color: var(--primary-strong);
}

.metric-card p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.subtle {
  margin-top: 6px;
  color: var(--muted);
}

@media (max-width: 1080px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
