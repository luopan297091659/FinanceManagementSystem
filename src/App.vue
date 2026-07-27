<template>
  <!-- Login View -->
  <LoginView v-if="!isAuthenticated" @authenticated="handleAuthenticated" />

  <!-- Main Application -->
  <div v-else class="app-shell" :style="shellStyle">
    <aside class="sidebar" :style="sidebarStyle">
      <div class="brand">
        <span class="brand-mark" :style="brandStyle">F</span>
        <div>
          <strong>{{ dictionary.appName }}</strong>
        </div>
      </div>

      <nav class="nav" :aria-label="dictionary.appName">
        <button
          v-for="item in visibleNavItems"
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

      <div class="user-card">
        <div class="user-info">
          <p class="user-name">{{ currentUser?.name || 'User' }}</p>
          <p class="user-role">{{ currentUser?.userRoles?.[0]?.role?.name || 'User' }}</p>
        </div>
        <button class="logout-button" @click="handleLogout" title="Logout">
          ↪ 
        </button>
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
      <SystemAdminPanel v-else-if="activeView === 'system'" :permissions="currentPermissions" />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import LoginView from "./views/login.vue";
import GisView from "./views/gis/index.vue";
import ResourcesView from "./views/resources.vue";
import CustomersView from "./views/customers.vue";
import FinanceView from "./views/finance.vue";
import OcrView from "./views/ocr.vue";
import KnowledgeView from "./views/knowledge.vue";
import SystemAdminPanel from "./components/rbac/SystemAdminPanel.vue";
import { useI18n } from "./i18n";
import { api } from "./services/api";

const activeView = ref("gis");
const theme = ref("teal");
const isAuthenticated = ref(false);
const currentUser = ref(null);
const currentPermissions = ref([]);
const { locale, dictionary, setLocale } = useI18n();

const navItems = computed(() => [
  { key: "overview", label: dictionary.value.overview },
  { key: "gis", label: dictionary.value.gis },
  { key: "resources", label: dictionary.value.resources },
  { key: "customers", label: dictionary.value.customers },
  { key: "finance", label: dictionary.value.finance },
  { key: "ocr", label: dictionary.value.ocr },
  { key: "knowledge", label: dictionary.value.knowledge },
  { key: "system", label: dictionary.value.systemAdmin },
]);

const hasAnyPermission = (permissions) => {
  return permissions.some((permission) => currentPermissions.value.includes(permission));
};

const visibleNavItems = computed(() => navItems.value.filter((item) => {
  if (item.key !== "system") return true;
  return hasAnyPermission(["user:view", "role:view", "audit_log:view"]);
}));

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

const clearAuth = () => {
  localStorage.removeItem('auth-token');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
  isAuthenticated.value = false;
  currentUser.value = null;
  currentPermissions.value = [];
  if (activeView.value === "system") {
    activeView.value = "gis";
  }
};

const checkAuth = async () => {
  const token = localStorage.getItem('auth-token');
  const user = localStorage.getItem('user');
  if (!token) {
    clearAuth();
    return;
  }

  try {
    const result = await api.getCurrentUser();
    if (!result.user) {
      clearAuth();
      return;
    }
    currentUser.value = result.user || (user ? JSON.parse(user) : null);
    currentPermissions.value = result.permissions || [];
    isAuthenticated.value = true;
    localStorage.setItem('permissions', JSON.stringify(currentPermissions.value));
  } catch (e) {
    clearAuth();
  }
};

const handleAuthenticated = (payload) => {
  const user = payload?.user || payload;
  currentUser.value = user;
  currentPermissions.value = payload?.permissions || [];
  localStorage.setItem('permissions', JSON.stringify(currentPermissions.value));
  isAuthenticated.value = true;
};

const handleLogout = () => {
  clearAuth();
};

onMounted(() => {
  window.addEventListener('auth-expired', clearAuth);
  checkAuth();
});

onBeforeUnmount(() => {
  window.removeEventListener('auth-expired', clearAuth);
});
</script>

<style scoped>
.app-shell {
  --line: rgba(255, 255, 255, 0.06);
  --muted: #b7c2ce;
  --surface: var(--sidebar-bg);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100vh;
  background: #0f172a;
  color: #e5eef7;
}

.sidebar {
  border-right: 1px solid var(--line);
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--primary);
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  font-size: 18px;
}

.brand strong {
  font-size: 14px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;
}

.nav-item {
  border: 0;
  border-left: 3px solid transparent;
  padding: 10px 12px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.2s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.nav-item.active {
  color: var(--primary-strong);
  border-left-color: var(--primary-strong);
  background: rgba(255, 255, 255, 0.04);
}

.sidebar-card,
.theme-card,
.user-card {
  margin-top: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: #e5eef7;
}

.eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--muted);
  margin: 0 0 8px;
}

.sidebar-card p,
.theme-card p,
.user-card p {
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

.user-card {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  flex: 1;
}

.user-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e5eef7;
}

.user-role {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.logout-button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.logout-button:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.workspace {
  display: flex;
  flex-direction: column;
  background: #0f172a;
  overflow: hidden;
}

.topbar {
  border-bottom: 1px solid var(--line);
  padding: 20px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.topbar > div:first-child h1 {
  margin: 6px 0;
  font-size: 28px;
  color: #e5eef7;
}

.topbar > div:first-child p {
  margin: 0;
}

.topbar-actions {
  display: flex;
  gap: 12px;
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
  background: transparent;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.locale-button:last-child {
  border-right: 0;
}

.locale-button.active {
  background: var(--primary);
  color: #fff;
}

.ghost-button,
.primary-button {
  padding: 10px 16px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 14px;
}

.ghost-button:hover {
  border-color: var(--primary);
  color: var(--primary-strong);
}

.primary-button {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.primary-button:hover {
  opacity: 0.9;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 32px;
  overflow-y: auto;
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

  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }
}
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
