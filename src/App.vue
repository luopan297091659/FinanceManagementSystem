<template>
  <div class="app-shell" :style="shellStyle">
    <aside class="sidebar" :style="sidebarStyle">
      <div class="brand">
        <span class="brand-mark" :style="brandStyle">F</span>
        <div>
          <strong>{{ dictionary.appName }}</strong>
        </div>
      </div>

      <nav class="nav" :aria-label="dictionary.appName">
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
        <p class="eyebrow">{{ dictionary.progressTitle }}</p>
        <p>{{ dictionary.progressBody }}</p>
      </div>

      <div class="theme-card">
        <p class="eyebrow">{{ dictionary.theme }}</p>
        <div class="theme-swatches">
          <button v-for="theme in themes" :key="theme.key" class="swatch" :aria-label="theme.label" :style="{ background: theme.color }" type="button" @click="setTheme(theme.key)" />
        </div>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ dictionary.company }}</p>
          <h1>{{ currentTitle }}</h1>
          <p class="subtle">{{ currentSubtitle }}</p>
        </div>
        <div class="topbar-actions">
          <div class="locale-switch" role="group" aria-label="Language">
            <button class="locale-button" :class="{ active: locale === 'ja' }" type="button" @click="setLocale('ja')">日本語</button>
            <button class="locale-button" :class="{ active: locale === 'zh' }" type="button" @click="setLocale('zh')">中文</button>
          </div>
          <button class="ghost-button" type="button" @click="activeView = 'gis'">{{ dictionary.openGis }}</button>
          <button class="primary-button" type="button" @click="activeView = 'overview'">{{ dictionary.overview }}</button>
        </div>
      </header>

      <section v-if="activeView === 'overview'" class="overview-grid">
        <article class="metric-card">
          <span class="metric-label">{{ dictionary.metrics.assets }}</span>
          <strong class="metric-value">6</strong>
          <p>梅田・難波などの重点物件を含みます。</p>
        </article>
        <article class="metric-card">
          <span class="metric-label">{{ dictionary.metrics.alerts }}</span>
          <strong class="metric-value">4</strong>
          <p>warning / attention / critical の物件です。</p>
        </article>
        <article class="metric-card">
          <span class="metric-label">{{ dictionary.metrics.search }}</span>
          <strong class="metric-value">{{ dictionary.metrics.realtime }}</strong>
          <p>建物、部屋、契約者、家主、住所を検索できます。</p>
        </article>
      </section>

      <GisView v-else-if="activeView === 'gis'" />
      <ResourcesView v-else-if="activeView === 'resources'" />
      <CustomersView v-else-if="activeView === 'customers'" />
      <FinanceView v-else-if="activeView === 'finance'" />
      <OcrView v-else-if="activeView === 'ocr'" />
      <KnowledgeView v-else-if="activeView === 'knowledge'" />
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import GisView from "./views/gis/index.vue";
import ResourcesView from "./views/resources.vue";
import CustomersView from "./views/customers.vue";
import FinanceView from "./views/finance.vue";
import OcrView from "./views/ocr.vue";
import KnowledgeView from "./views/knowledge.vue";
import { useI18n } from "./i18n";

const activeView = ref("gis");
const theme = ref("teal");
const { locale, dictionary, setLocale } = useI18n();
const navItems = computed(() => [
  { key: "overview", label: dictionary.value.overview },
  { key: "gis", label: dictionary.value.gis },
  { key: "resources", label: dictionary.value.resources },
  { key: "customers", label: dictionary.value.customers },
  { key: "finance", label: dictionary.value.finance },
  { key: "ocr", label: dictionary.value.ocr },
  { key: "knowledge", label: dictionary.value.knowledge },
]);
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
  return dictionary.value[activeView.value] || dictionary.value.overview;
});

const currentSubtitle = computed(() => {
  return dictionary.value.subtitles[activeView.value] || "";
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

.locale-switch {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.locale-button {
  min-height: 38px;
  border: 0;
  border-right: 1px solid var(--line);
  padding: 0 10px;
  background: #fff;
  color: var(--muted);
  font-weight: 700;
}

.locale-button:last-child {
  border-right: 0;
}

.locale-button.active {
  background: var(--primary);
  color: #fff;
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
