<template>
  <ConfirmDialog />
  <div v-if="!authChecked" class="auth-checking" role="status" aria-live="polite">
    <span class="auth-checking-spinner" />
    <span>{{ dictionary.common?.loading }}</span>
  </div>

  <!-- Login View -->
  <LoginView v-else-if="!isAuthenticated" @authenticated="handleAuthenticated" />

  <!-- Main Application -->
  <div v-else class="app-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }" :style="shellStyle">
    <aside class="sidebar" :style="sidebarStyle">
      <div class="sidebar-main">
        <div class="brand">
          <span class="brand-mark" :style="brandStyle">F</span>
          <div class="brand-text">
            <strong>{{ dictionary.appName }}</strong>
          </div>
        </div>

        <button class="sidebar-toggle" type="button" :title="sidebarToggleLabel" :aria-label="sidebarToggleLabel" @click="toggleSidebar">
          <AppIcon :name="isSidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="18" />
        </button>

      <nav class="nav" :aria-label="dictionary.appName">
        <button
          v-for="item in regularNavItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeNavKey === item.key }"
          :title="item.label"
          type="button"
          @click="setActiveNavItem(item)"
        >
          <AppIcon :name="item.icon" class="nav-icon" :size="19" />
          <span class="nav-label">{{ item.label }}</span>
        </button>

        <div v-if="aiNavItems.length" class="nav-group" :class="{ open: isAiAnalysisExpanded, active: isAiAnalysisActive }">
          <button
            class="nav-item nav-parent"
            :class="{ active: isAiAnalysisActive }"
            :title="aiMenuTitle"
            type="button"
            :aria-expanded="isAiAnalysisExpanded"
            @click="toggleAiAnalysis"
          >
            <AppIcon name="brain" class="nav-icon" :size="19" />
            <span class="nav-label">{{ aiMenuTitle }}</span>
            <AppIcon name="chevron-right" class="nav-chevron" :size="16" />
          </button>

          <div v-show="isAiAnalysisExpanded" class="nav-children">
            <button
              v-for="item in aiNavItems"
              :key="item.key"
              class="nav-item nav-child"
              :class="{ active: activeNavKey === item.key }"
              :title="item.label"
              type="button"
              @click="setActiveNavItem(item)"
            >
              <AppIcon :name="item.icon" class="nav-icon" :size="18" />
              <span class="nav-label">{{ item.label }}</span>
            </button>
          </div>
        </div>
      </nav>
      </div>

    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="page-heading">
          <div class="page-heading-row">
            <h1>{{ currentTitle }}</h1>
            <div id="page-header-actions" class="page-header-actions"></div>
          </div>
          <p class="subtle">{{ currentSubtitle }}</p>
        </div>
        <div class="topbar-actions">
          <div class="locale-switch" role="group" :aria-label="dictionary.language">
            <button class="locale-button" :class="{ active: locale === 'ja' }" type="button" @click="setLocale('ja')">{{ dictionary.languageJapanese }}</button>
            <button class="locale-button" :class="{ active: locale === 'zh' }" type="button" @click="setLocale('zh')">{{ dictionary.languageChinese }}</button>
          </div>
          <button class="ghost-button" type="button" @click="setActiveNavItem({ key: 'gis' })">{{ dictionary.openGis }}</button>
          <div class="settings-menu" @click.stop>
            <button class="icon-button" type="button" :title="dictionary.theme" :aria-label="dictionary.theme" :aria-expanded="isSettingsOpen" @click="isSettingsOpen = !isSettingsOpen">
              <AppIcon name="settings" :size="18" />
            </button>
            <div v-if="isSettingsOpen" class="settings-popover">
              <p class="settings-title">{{ dictionary.theme }}</p>
              <div class="theme-options">
                <button
                  v-for="themeOption in themes"
                  :key="themeOption.key"
                  class="theme-option"
                  :class="{ active: theme === themeOption.key }"
                  type="button"
                  @click="setTheme(themeOption.key)"
                >
                  <span class="theme-color" :style="{ background: themeOption.color }" />
                  <span>{{ dictionary[themeOption.labelKey] }}</span>
                  <AppIcon v-if="theme === themeOption.key" name="check" :size="16" />
                </button>
              </div>
            </div>
          </div>
          <div class="topbar-user">
            <span class="user-avatar" :style="brandStyle">{{ userInitial }}</span>
            <div class="user-info">
              <p class="user-name">{{ currentUser?.name || dictionary.userFallback }}</p>
              <p class="user-role">{{ currentUser?.userRoles?.[0]?.role?.name || dictionary.userFallback }}</p>
            </div>
          </div>
          <button class="logout-button" type="button" @click="handleLogout" :title="dictionary.logout" :aria-label="dictionary.logout">
            <AppIcon name="logout" :size="18" />
          </button>
        </div>
      </header>

      <OverviewView v-if="activeView === 'overview'" @navigate="handleDashboardNavigate" />

      <GisView v-else-if="activeView === 'gis'" />
      <ResourcesView v-else-if="activeView === 'resources'" />
      <ContractsView v-else-if="activeView === 'contracts'" />
      <FinanceView v-else-if="activeView === 'finance'" />
      <OcrView v-else-if="activeView === 'ocr'" />
      <BankReconciliationView v-else-if="activeView === 'bank-reconciliation'" />
      <KnowledgeView v-else-if="activeView === 'knowledge'" />
      <SystemAdminPanel v-else-if="activeView === 'system'" :permissions="currentPermissions" :initial-tab="activeSystemTab" />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import LoginView from "./views/login.vue";
import OverviewView from "./views/overview.vue";
import GisView from "./views/gis/index.vue";
import ResourcesView from "./views/resources.vue";
import ContractsView from "./views/contracts.vue";
import FinanceView from "./views/finance.vue";
import OcrView from "./views/ocr.vue";
import BankReconciliationView from "./views/bank-reconciliation.vue";
import KnowledgeView from "./views/knowledge.vue";
import SystemAdminPanel from "./components/rbac/SystemAdminPanel.vue";
import AppIcon from "./components/AppIcon.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import { reloadPublishedTranslations, useI18n } from "./i18n";
import { api } from "./services/api";
import { APP_ENTRY_PATH as appEntryPath, appPath } from "./utils/appPath";

const activeView = ref("overview");
const activeNavKey = ref("overview");
const activeSystemTab = ref("users");
const theme = ref("teal");
const isSidebarCollapsed = ref(false);
const isAiAnalysisExpanded = ref(true);
const isSettingsOpen = ref(false);
const authChecked = ref(false);
const isAuthenticated = ref(false);
const currentUser = ref(null);
const currentPermissions = ref([]);
const { locale, dictionary, setLocale } = useI18n();
const reconciliationMenuLabels = computed(() => ({
  bank: `AI / ${dictionary.value.bankReconciliation.menu.bankReconciliation}`,
  ocr: dictionary.value.ocrReconciliation,
  bankSubtitle: dictionary.value.bankReconciliation.help.subtitle,
  ocrSubtitle: dictionary.value.subtitles.ocr,
}));

const navItems = computed(() => [
  { key: "overview", label: dictionary.value.overview, icon: "dashboard", permissions: ["overview:view"] },
  { key: "gis", label: dictionary.value.gis, icon: "map", permissions: ["gis:view"] },
  { key: "resources", label: dictionary.value.resources, icon: "building", permissions: ["property.view", "property:view"] },
  { key: "contracts", label: dictionary.value.contracts, icon: "users", permissions: ["contract.view"] },
  { key: "finance", label: dictionary.value.finance, icon: "finance", permissions: ["payment:view"] },
  { key: "bank-reconciliation", label: reconciliationMenuLabels.value.bank, icon: "finance", permissions: ["reconciliation.bank.view"] },
  { key: "ocr", label: reconciliationMenuLabels.value.ocr, icon: "search", permissions: ["reconciliation.ocr.view", "ocr:execute"] },
  { key: "knowledge", label: dictionary.value.knowledge, icon: "brain", permissions: ["knowledge:view"] },
  { key: "system-users", view: "system", tab: "users", label: dictionary.value.systemUsers, icon: "user-cog", permissions: ["user:view"] },
  { key: "system-roles", view: "system", tab: "roles", label: dictionary.value.systemRoles, icon: "shield", permissions: ["role:view"] },
  { key: "system-logs", view: "system", tab: "logs", label: dictionary.value.systemLogs, icon: "scroll", permissions: ["audit_log:view"] },
  { key: "system-email", view: "system", tab: "email", label: dictionary.value.systemEmail, icon: "mail", permissions: ["setting:email"] },
  { key: "system-translations", view: "system", tab: "translations", label: dictionary.value.systemTranslations, icon: "languages", permissions: ["i18n.translation.view"] },
]);

const aiMenuTitle = computed(() => dictionary.value.aiAnalysis);

const syncPublishedCopy = () => reloadPublishedTranslations((localeCode) => api.getPublishedTranslations(localeCode)).catch(() => undefined);

const hasAnyPermission = (permissions) => {
  return permissions.some((permission) => currentPermissions.value.includes(permission));
};

const visibleNavItems = computed(() => navItems.value.filter((item) => {
  if (!item.permissions) return true;
  return hasAnyPermission(item.permissions);
}));

const ensureActiveNavVisible = () => {
  if (visibleNavItems.value.some((item) => item.key === activeNavKey.value)) return;
  const [firstVisible] = visibleNavItems.value;
  if (firstVisible) setActiveNavItem(firstVisible);
};

const regularNavItems = computed(() => visibleNavItems.value.filter((item) => !["bank-reconciliation", "ocr"].includes(item.key)));
const aiNavItems = computed(() => visibleNavItems.value
  .filter((item) => ["bank-reconciliation", "ocr"].includes(item.key))
  .map((item) => ({
    ...item,
    label: item.key === "bank-reconciliation"
      ? reconciliationMenuLabels.value.bank.replace(/^AI\s*\/\s*/, "")
      : reconciliationMenuLabels.value.ocr.replace(/^AI\s*\/\s*/, ""),
  })));
const isAiAnalysisActive = computed(() => ["bank-reconciliation", "ocr"].includes(activeNavKey.value));
const userInitial = computed(() => (currentUser.value?.name || dictionary.value.userFallback || "U").trim().slice(0, 1).toUpperCase());

const toggleAiAnalysis = () => {
  isAiAnalysisExpanded.value = !isAiAnalysisExpanded.value;
};

const setActiveNavItem = (item) => {
  activeNavKey.value = item.key;
  activeView.value = item.view || item.key;
  if (["bank-reconciliation", "ocr"].includes(item.key)) {
    isAiAnalysisExpanded.value = true;
  }
  if (item.tab) {
    activeSystemTab.value = item.tab;
  }
  if (item.key === "bank-reconciliation") {
    window.history.pushState({}, "", appPath("/ai-reconciliation/bank"));
  } else if (item.key === "ocr") {
    window.history.pushState({}, "", appPath("/ai-reconciliation/ocr"));
  } else if (item.key === "contracts") {
    window.history.pushState({}, "", appPath("/contracts"));
  } else if (item.key === "resources") {
    window.history.pushState({}, "", appPath("/resources"));
  } else if (item.key === "overview") {
    window.history.pushState({}, "", appPath("/"));
  } else if (item.key === "gis") {
    window.history.pushState({}, "", appPath("/gis"));
  } else if (item.key === "finance") {
    window.history.pushState({}, "", appPath("/finance"));
  }
};

const handleDashboardNavigate = (route) => {
  const item = route.startsWith("/ai-reconciliation/bank")
    ? navItems.value.find((entry) => entry.key === "bank-reconciliation")
    : route.startsWith("/ai-reconciliation/ocr")
      ? navItems.value.find((entry) => entry.key === "ocr")
      : route.startsWith("/contracts")
        ? navItems.value.find((entry) => entry.key === "contracts")
        : route.startsWith("/resources")
          ? navItems.value.find((entry) => entry.key === "resources")
          : route.startsWith("/finance")
            ? navItems.value.find((entry) => entry.key === "finance")
            : route.startsWith("/gis")
              ? navItems.value.find((entry) => entry.key === "gis")
              : null;
  if (item && visibleNavItems.value.some((entry) => entry.key === item.key)) setActiveNavItem(item);
};

const applyRouteFromLocation = () => {
  const rawPath = window.location.pathname;
  const entryPrefix = appEntryPath === '/' ? '' : appEntryPath.replace(/\/$/, '');
  const path = entryPrefix && rawPath.startsWith(entryPrefix)
    ? rawPath.slice(entryPrefix.length) || '/'
    : rawPath;
  const requestedView = new URLSearchParams(window.location.search).get("view");
  if (requestedView === "ocr") {
    activeNavKey.value = "ocr";
    activeView.value = "ocr";
    isAiAnalysisExpanded.value = true;
  } else if (path === "/ai-reconciliation" || path === "/ai-reconciliation/") {
    window.history.replaceState({}, "", appPath("/ai-reconciliation/ocr"));
    activeNavKey.value = "ocr";
    activeView.value = "ocr";
  } else if (path.startsWith("/ai-reconciliation/bank")) {
    activeNavKey.value = "bank-reconciliation";
    activeView.value = "bank-reconciliation";
    isAiAnalysisExpanded.value = true;
  } else if (path.startsWith("/ai-reconciliation/ocr")) {
    activeNavKey.value = "ocr";
    activeView.value = "ocr";
    isAiAnalysisExpanded.value = true;
  } else if (path.startsWith("/contracts") || path.startsWith("/customers")) {
    if (path.startsWith("/customers")) window.history.replaceState({}, "", appPath("/contracts"));
    activeNavKey.value = "contracts";
    activeView.value = "contracts";
  } else if (path.startsWith("/resources")) {
    activeNavKey.value = "resources";
    activeView.value = "resources";
  } else if (path.startsWith("/finance")) {
    activeNavKey.value = "finance";
    activeView.value = "finance";
  } else if (path.startsWith("/gis")) {
    activeNavKey.value = "gis";
    activeView.value = "gis";
  } else if (path === "/") {
    activeNavKey.value = "overview";
    activeView.value = "overview";
  }
};

const themes = [
  { key: "teal", labelKey: "themeTeal", color: "#0f766e" },
  { key: "blue", labelKey: "themeBlue", color: "#2563eb" },
  { key: "purple", labelKey: "themePurple", color: "#7c3aed" },
];

const palette = {
  teal: { primary: "#0f766e", accent: "#14b8a6", surface: "#f5fbfa" },
  blue: { primary: "#2563eb", accent: "#38bdf8", surface: "#f5f9ff" },
  purple: { primary: "#7c3aed", accent: "#a78bfa", surface: "#faf7ff" },
};

const shellStyle = computed(() => ({
  "--primary": palette[theme.value].primary,
  "--primary-strong": palette[theme.value].accent,
  "--sidebar-bg": palette[theme.value].surface,
  "--sidebar-width": isSidebarCollapsed.value ? "72px" : "240px",
}));

const sidebarStyle = computed(() => ({ background: palette[theme.value].surface }));
const brandStyle = computed(() => ({ background: palette[theme.value].primary }));
const sidebarToggleLabel = computed(() => (isSidebarCollapsed.value ? dictionary.value.expandSidebar : dictionary.value.collapseSidebar));

const currentTitle = computed(() => {
  const current = visibleNavItems.value.find((item) => item.key === activeNavKey.value);
  return current?.label || dictionary.value[activeView.value] || dictionary.value.overview;
});

const currentSubtitle = computed(() => {
  if (activeView.value === "bank-reconciliation") return reconciliationMenuLabels.value.bankSubtitle;
  if (activeView.value === "ocr") return reconciliationMenuLabels.value.ocrSubtitle;
  return dictionary.value.subtitles[activeView.value] || "";
});

const setTheme = (key) => {
  theme.value = key;
  isSettingsOpen.value = false;
};

const closeSettings = () => {
  isSettingsOpen.value = false;
};

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};

const clearAuth = () => {
  localStorage.removeItem('auth-token');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
  isAuthenticated.value = false;
  currentUser.value = null;
  currentPermissions.value = [];
  authChecked.value = true;
  if (activeView.value === "system") {
    activeView.value = "gis";
    activeNavKey.value = "gis";
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
    ensureActiveNavVisible();
  } catch (e) {
    clearAuth();
  } finally {
    authChecked.value = true;
  }
};

const handleAuthenticated = (payload) => {
  const user = payload?.user || payload;
  currentUser.value = user;
  currentPermissions.value = payload?.permissions || [];
  localStorage.setItem('permissions', JSON.stringify(currentPermissions.value));
  isAuthenticated.value = true;
  authChecked.value = true;
  ensureActiveNavVisible();
  syncPublishedCopy();
};

const handleLogout = () => {
  clearAuth();
};

onMounted(() => {
  document.addEventListener('click', closeSettings);
  window.addEventListener('auth-expired', clearAuth);
  window.addEventListener('popstate', applyRouteFromLocation);
  applyRouteFromLocation();
  syncPublishedCopy();
  checkAuth();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeSettings);
  window.removeEventListener('auth-expired', clearAuth);
  window.removeEventListener('popstate', applyRouteFromLocation);
});
</script>

<style scoped>
.auth-checking {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  background: #f4f8fb;
  color: #526579;
  font-weight: 700;
}

.auth-checking-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #cfe1df;
  border-top-color: #0f766e;
  border-radius: 50%;
  animation: auth-spin 0.75s linear infinite;
}

@keyframes auth-spin {
  to { transform: rotate(360deg); }
}

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
  margin: 0;
  font-size: 28px;
  color: #e5eef7;
}

.page-heading-row,
.page-header-actions {
  display: flex;
  align-items: center;
}

.page-heading-row {
  flex-wrap: wrap;
  gap: 12px;
}

.page-header-actions {
  gap: 8px;
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

.app-shell {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  --line: #d8e1ea;
  --muted: #64748b;
  --surface: #ffffff;
  --shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  width: 100%;
  min-width: 0;
  height: 100dvh;
  overflow: hidden;
  background: #edf2f6;
  color: #1f2937;
}

.sidebar {
  width: var(--sidebar-width);
  min-width: 0;
  padding: 16px 12px;
  overflow: hidden;
  gap: 14px;
  border-right-color: #d8e1ea;
  color: #1f2937;
  box-shadow: 8px 0 24px rgba(15, 23, 42, 0.04);
}

.sidebar-main {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.sidebar-footer {
  flex: 0 0 auto;
  display: grid;
  gap: 12px;
}

.brand {
  min-height: 40px;
  margin-bottom: 14px;
}

.brand strong {
  color: #1f2937;
}

.brand-text,
.nav-label,
.sidebar-footer {
  transition: opacity 0.18s ease;
}

.sidebar-toggle {
  width: 100%;
  min-height: 32px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: #64748b;
  font-size: 18px;
}

.nav {
  margin-bottom: 0;
}

.nav-item {
  width: 100%;
  min-height: 40px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item:hover {
  background: #e8f7f4;
  color: var(--primary);
}

.nav-item.active {
  color: var(--primary);
  border-left-color: var(--primary);
  background: #dff4f1;
}

.nav-group {
  display: grid;
  gap: 4px;
}

.nav-parent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
}

.nav-group.active .nav-parent {
  color: var(--primary);
  background: #edf8f6;
}

.nav-chevron {
  flex: 0 0 auto;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  transition: transform 0.18s ease, color 0.18s ease;
}

.nav-group.open .nav-chevron {
  color: var(--primary);
  transform: rotate(90deg);
}

.nav-children {
  display: grid;
  gap: 4px;
  margin-left: 14px;
  padding-left: 10px;
  border-left: 1px solid #d8e1ea;
}

.nav-child {
  min-height: 36px;
  padding-left: 12px;
  border-left-width: 2px;
  font-size: 13px;
}

.nav-child.active {
  background: #dff4f1;
  color: var(--primary);
}

.sidebar-collapsed .brand-text,
.sidebar-collapsed .nav-label,
.sidebar-collapsed .sidebar-footer {
  opacity: 0;
  pointer-events: none;
}

.sidebar-collapsed .nav-item {
  display: grid;
  place-items: center;
  padding-inline: 0;
}

.sidebar-collapsed .nav-parent {
  justify-content: center;
}

.sidebar-collapsed .nav-chevron {
  display: none;
}

.sidebar-collapsed .nav-children {
  margin-left: 0;
  padding-left: 0;
  border-left: 0;
}

.sidebar-collapsed .nav-label {
  width: auto;
  overflow: visible;
  opacity: 1;
}

.workspace {
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 clamp(14px, 1.5vw, 28px) 28px;
  background: #edf2f6;
}

.workspace > * {
  width: 100%;
  max-width: none;
  margin-inline: 0;
}

.topbar {
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 10px;
  padding: 14px 0;
  border-bottom-color: #d8e1ea;
}

.topbar > div:first-child {
  min-width: 0;
}

.topbar-actions {
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.locale-button,
.ghost-button,
.primary-button,
.logout-button {
  border-radius: 8px;
}

.locale-button {
  background: transparent;
  color: #64748b;
}

.ghost-button {
  border-color: #d8e1ea;
  background: #ffffff;
  color: #1f2937;
}

.topbar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding-left: 12px;
  border-left: 1px solid #d8e1ea;
}

.topbar-user .user-info {
  min-width: 88px;
}

.topbar-user p {
  margin: 0;
}

.sidebar-card,
.theme-card,
.metric-card {
  border-radius: 8px;
}

.sidebar-card,
.theme-card {
  border-color: #d8e1ea;
  background: #ffffff;
  color: #1f2937;
}

.sidebar-card p,
.theme-card p {
  color: #64748b;
}

.metric-card {
  border-color: #d8e1ea;
  background: #ffffff;
  color: #1f2937;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}

.metric-card p,
.metric-label,
.subtle {
  color: #64748b;
}

.topbar > div:first-child h1 {
  color: #1f2937;
}

.overview-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 24px 0 0;
}

@media (max-width: 1080px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .sidebar {
    position: static;
    width: 100%;
    height: auto;
    max-height: 220px;
  }

  .sidebar-main {
    overflow: visible;
  }

  .brand,
  .sidebar-toggle,
  .sidebar-footer {
    display: none;
  }

  .nav {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .nav-item {
    flex: 0 0 auto;
    width: auto;
  }
}

@media (max-width: 720px) {
  .workspace {
    padding: 0 14px 20px;
  }

  .topbar {
    align-items: stretch;
  }

  .topbar-actions {
    justify-content: flex-start;
  }

  .topbar-user {
    width: 100%;
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }
}

/* Navigation and topbar refinements */
.sidebar {
  position: relative;
  overflow: visible;
  transition: width 0.2s ease;
}

.sidebar-main {
  height: 100%;
  padding-right: 0;
}

.brand {
  padding-inline: 0;
}

.brand-mark {
  flex: 0 0 40px;
}

.sidebar-toggle {
  position: absolute;
  z-index: 3;
  top: 22px;
  right: -14px;
  display: grid;
  place-items: center;
  width: 28px;
  min-height: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  color: #475569;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.sidebar-toggle:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: #f8fffd;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 11px;
}

.nav-icon {
  flex: 0 0 19px;
}

.nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-parent .nav-chevron {
  margin-left: auto;
}

.sidebar-collapsed .brand {
  justify-content: center;
}

.sidebar-collapsed .brand-text,
.sidebar-collapsed .nav-label {
  display: none;
}

.sidebar-collapsed .nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 40px;
  margin-inline: auto;
  padding: 0;
  border-left: 0;
}

.sidebar-collapsed .nav-item.active {
  box-shadow: inset 3px 0 0 var(--primary);
}

.sidebar-collapsed .nav-children {
  gap: 4px;
}

.settings-menu {
  position: relative;
}

.icon-button,
.logout-button {
  display: grid;
  place-items: center;
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid #d8e1ea;
  border-radius: 8px;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.icon-button:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--sidebar-bg);
}

.settings-popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  width: 180px;
  padding: 8px;
  border: 1px solid #d8e1ea;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
}

.settings-title {
  margin: 0;
  padding: 6px 8px 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.theme-options {
  display: grid;
  gap: 2px;
}

.theme-option {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  text-align: left;
  cursor: pointer;
}

.theme-option:hover,
.theme-option.active {
  background: #f1f5f9;
}

.theme-option.active {
  color: var(--primary);
  font-weight: 700;
}

.theme-color {
  width: 16px;
  height: 16px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #cbd5e1;
}

.topbar-actions {
  gap: 10px;
}

.locale-switch,
.locale-button,
.ghost-button {
  height: 40px;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
}

.topbar-user {
  min-height: 40px;
  height: 40px;
  padding-left: 10px;
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.topbar-user .user-info {
  min-width: 0;
}

.topbar-user .user-name {
  color: #1f2937;
  line-height: 1.25;
}

.topbar-user .user-role {
  color: #64748b;
  line-height: 1.25;
}

@media (max-width: 1080px) {
  .sidebar {
    overflow: hidden;
  }
}

@media (max-width: 720px) {
  .topbar-user {
    width: auto;
    padding: 0 0 0 10px;
    border-top: 0;
    border-left: 1px solid var(--line);
  }
}
</style>
