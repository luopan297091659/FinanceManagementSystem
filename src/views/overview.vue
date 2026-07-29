<template>
  <section class="dashboard">
    <div class="dashboard-toolbar">
      <div class="quick-filters" role="group" :aria-label="t.quickFilters">
        <button
          v-for="filter in quickFilters"
          :key="filter.key"
          class="quick-filter"
          :class="{ active: activeQuickFilter === filter.key }"
          type="button"
          @click="applyQuickFilter(filter.key)"
        >
          {{ t[filter.label] }}
        </button>
      </div>
      <div class="date-fields">
        <label>
          <span>{{ t.startDate }}</span>
          <input v-model="draftStartDate" type="date" :max="draftEndDate || undefined">
        </label>
        <span class="date-separator">–</span>
        <label>
          <span>{{ t.endDate }}</span>
          <input v-model="draftEndDate" type="date" :min="draftStartDate || undefined">
        </label>
      </div>
      <button class="primary-action" type="button" :disabled="loading" @click="search">{{ t.search }}</button>
      <button class="secondary-action" type="button" :disabled="loading" @click="reset">{{ t.reset }}</button>
      <button class="icon-action" type="button" :title="t.refresh" :aria-label="t.refresh" :disabled="loading" @click="loadOverview">
        <AppIcon name="refresh" :size="18" />
      </button>
      <button v-if="dashboard?.canEditConfig" class="secondary-action config-action" type="button" @click="openConfig">
        <AppIcon name="settings" :size="17" /> {{ t.configure }}
      </button>
    </div>

    <div class="range-summary">
      <span class="range-dot" />
      {{ rangeLabel }}
      <span v-if="lastUpdated" class="last-updated">{{ t.updated }} {{ formatTime(lastUpdated) }}</span>
    </div>

    <div v-if="loading && !dashboard" class="summary-grid" aria-busy="true">
      <div v-for="index in 4" :key="index" class="summary-card skeleton-card">
        <span class="skeleton skeleton-icon" /><span class="skeleton skeleton-line" /><span class="skeleton skeleton-value" />
      </div>
    </div>
    <div v-else-if="error && !dashboard" class="dashboard-state error-state">
      <AppIcon name="alert" :size="24" />
      <div><strong>{{ t.loadFailed }}</strong><p>{{ error }}</p></div>
      <button type="button" class="secondary-action" @click="loadOverview">{{ t.retry }}</button>
    </div>
    <template v-else>
      <div class="summary-grid">
        <button v-for="card in dashboard?.cards || []" :key="card.id" class="summary-card" type="button" @click="navigate(card.route)">
          <span class="card-icon"><AppIcon :name="card.icon" :size="21" /></span>
          <span class="card-copy">
            <span class="card-title">{{ label(card.titleKey) }}</span>
            <strong>{{ formatNumber(card.value) }} <small>{{ unit(card.metricKey) }}</small></strong>
            <span class="card-description">{{ description(card.metricKey) }}</span>
          </span>
          <span v-if="card.abnormalCount !== null && card.abnormalCount > 0" class="abnormal-badge">{{ card.abnormalCount }} {{ t.pending }}</span>
          <AppIcon name="arrow-up-right" class="card-arrow" :size="17" />
        </button>
        <div v-if="!dashboard?.cards?.length" class="dashboard-state empty-state">{{ t.noCards }}</div>
      </div>

      <div class="dashboard-row dashboard-row-primary">
        <article class="dashboard-panel alerts-panel">
          <header class="panel-header">
            <div><span class="section-kicker">{{ t.attention }}</span><h2>{{ t.tasksAlerts }}</h2></div>
            <span class="panel-count">{{ visibleReminders.length }}</span>
          </header>
          <div class="panel-filters">
            <select v-model="reminderType" :aria-label="t.filterType">
              <option value="">{{ t.allTypes }}</option>
              <option v-for="type in reminderTypes" :key="type" :value="type">{{ label(type) }}</option>
            </select>
            <select v-model="reminderSeverity" :aria-label="t.filterSeverity">
              <option value="">{{ t.allSeverities }}</option>
              <option v-for="severity in ['overdue','critical','warning','info']" :key="severity" :value="severity">{{ label(severity) }}</option>
            </select>
          </div>
          <div v-if="visibleReminders.length" class="reminder-list">
            <div v-for="reminder in displayedReminders" :key="reminder.id" class="reminder-item" :class="`severity-${reminder.severity}`">
              <span class="severity-marker"><AppIcon :name="reminder.severity === 'overdue' ? 'clock' : 'alert'" :size="17" /></span>
              <div class="reminder-content">
                <div class="reminder-heading"><strong>{{ label(reminder.titleKey) }}</strong><span class="severity-pill">{{ label(reminder.severity) }}</span></div>
                <p>{{ reminder.object }}</p>
                <span class="reminder-date">{{ t.due }} {{ formatDate(reminder.dueDate) }}</span>
              </div>
              <div class="reminder-actions">
                <button type="button" @click="navigate(reminder.route)">{{ t.openTask }}</button>
                <button type="button" :title="t.markRead" @click="markRead(reminder)"><AppIcon name="check" :size="16" /></button>
                <button type="button" :title="t.ignore" @click="ignore(reminder)"><AppIcon name="eye-off" :size="16" /></button>
              </div>
            </div>
          </div>
          <div v-else class="panel-empty"><AppIcon name="check-circle" :size="26" /><span>{{ t.noAlerts }}</span></div>
          <button v-if="visibleReminders.length > 5" class="view-all" type="button" @click="showAllReminders = !showAllReminders">
            {{ showAllReminders ? t.showLess : t.viewAll }}
          </button>
        </article>

        <article class="dashboard-panel">
          <header class="panel-header"><div><span class="section-kicker">{{ t.liveOverview }}</span><h2>{{ t.businessStatus }}</h2></div></header>
          <div v-if="dashboard?.businessStatus?.length" class="status-list">
            <button v-for="item in dashboard.businessStatus" :key="item.key" type="button" @click="navigate(item.route)">
              <span class="status-icon" :class="`status-${item.severity}`"><AppIcon :name="item.icon" :size="18" /></span>
              <span>{{ label(item.key) }}</span>
              <strong>{{ formatNumber(item.count) }}</strong>
              <span class="status-dot" :class="`status-${item.severity}`" />
            </button>
          </div>
          <div v-else class="panel-empty">{{ t.noStatus }}</div>
        </article>
      </div>

      <div class="dashboard-row dashboard-row-secondary">
        <article class="dashboard-panel finance-panel">
          <header class="panel-header">
            <div><span class="section-kicker">{{ t.selectedPeriod }}</span><h2>{{ t.financialSummary }}</h2></div>
            <span class="range-chip">{{ rangeLabel }}</span>
          </header>
          <div v-if="dashboard?.financialSummary" class="finance-summary">
            <div class="finance-primary">
              <div><span>{{ t.totalIncome }}</span><strong class="positive">{{ yen(dashboard.financialSummary.income) }}</strong></div>
              <div><span>{{ t.totalExpense }}</span><strong class="negative">{{ yen(dashboard.financialSummary.expense, true) }}</strong></div>
              <div class="balance"><span>{{ t.netBalance }}</span><strong>{{ yen(dashboard.financialSummary.balance) }}</strong></div>
            </div>
            <div class="finance-secondary">
              <div><span>{{ t.ownerRemittance }}</span><strong>{{ yen(dashboard.financialSummary.ownerRemittance) }}</strong></div>
              <div><span>{{ t.unconfirmedIncome }}</span><strong>{{ yen(dashboard.financialSummary.unconfirmedIncome) }}</strong></div>
              <div><span>{{ t.pendingPayment }}</span><strong>{{ yen(dashboard.financialSummary.pendingPayment) }}</strong></div>
            </div>
          </div>
          <div v-else class="restricted-state"><AppIcon name="shield" :size="20" /> {{ t.financialRestricted }}</div>
        </article>

        <article class="dashboard-panel activity-panel">
          <header class="panel-header"><div><span class="section-kicker">{{ t.latestChanges }}</span><h2>{{ t.recentActivity }}</h2></div></header>
          <div v-if="dashboard?.recentActivities?.length" class="activity-list">
            <button v-for="activity in dashboard.recentActivities" :key="activity.id" type="button" @click="navigate(activity.route)">
              <span class="activity-icon"><AppIcon name="activity" :size="17" /></span>
              <span class="activity-copy"><strong>{{ activity.type }}</strong><span>{{ activity.object }}</span><small>{{ activity.operator }} · {{ formatDateTime(activity.timestamp) }}</small></span>
            </button>
          </div>
          <div v-else class="panel-empty">{{ t.noActivity }}</div>
        </article>
      </div>
    </template>

    <div v-if="configOpen" class="modal-backdrop" @click.self="configOpen = false">
      <section class="config-modal" role="dialog" aria-modal="true" :aria-label="t.configurationTitle">
        <header><div><span class="section-kicker">{{ t.administrator }}</span><h2>{{ t.configurationTitle }}</h2><p>{{ t.configurationHelp }}</p></div><button type="button" class="modal-close" @click="configOpen = false">×</button></header>
        <div v-if="configError" class="inline-error">{{ configError }}</div>
        <div class="config-list">
          <div v-for="(card, index) in editableCards" :key="card.id" class="config-card">
            <label class="toggle"><input v-model="card.enabled" type="checkbox" @change="validateEnabled(card)"><span /></label>
            <span class="config-icon"><AppIcon :name="card.icon" :size="19" /></span>
            <div class="config-fields">
              <label>{{ t.cardTitle }}<select v-model="card.titleKey"><option v-for="option in cardTitleOptions" :key="option" :value="option">{{ label(option) }}</option></select></label>
              <label>{{ t.visibleRoles }}<input :value="card.visibleRoles.join(', ')" type="text" :placeholder="t.allRoles" @change="card.visibleRoles = parseRoles($event.target.value)"></label>
            </div>
            <div class="sort-actions">
              <button type="button" :disabled="index === 0" @click="moveCard(index, -1)">↑</button>
              <button type="button" :disabled="index === editableCards.length - 1" @click="moveCard(index, 1)">↓</button>
            </div>
          </div>
        </div>
        <footer><span>{{ enabledCount }}/4 {{ t.enabled }}</span><button class="secondary-action" type="button" @click="configOpen = false">{{ t.cancel }}</button><button class="primary-action" type="button" :disabled="savingConfig" @click="saveConfig">{{ savingConfig ? t.saving : t.save }}</button></footer>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { useI18n } from "../i18n";
import { api } from "../services/api";

const emit = defineEmits(["navigate"]);
const { locale, dictionary } = useI18n();
const dashboard = ref(null);
const loading = ref(false);
const error = ref("");
const draftStartDate = ref("");
const draftEndDate = ref("");
const activeQuickFilter = ref("all");
const lastUpdated = ref(null);
const reminderType = ref("");
const reminderSeverity = ref("");
const showAllReminders = ref(false);
const configOpen = ref(false);
const editableCards = ref([]);
const savingConfig = ref(false);
const configError = ref("");

const t = computed(() => dictionary.value.dashboard);
const quickFilters = [
  { key: "all", label: "all" }, { key: "thisMonth", label: "thisMonth" },
  { key: "lastMonth", label: "lastMonth" }, { key: "thisQuarter", label: "thisQuarter" },
  { key: "thisYear", label: "thisYear" },
];
const cardTitleOptions = ["unpaidRent", "pendingReconciliation", "activeContracts", "managedProperties"];
const enabledCount = computed(() => editableCards.value.filter((card) => card.enabled).length);
const rangeLabel = computed(() => {
  if (!dashboard.value?.dateRange || dashboard.value.dateRange.label === "all") return t.value.allData;
  const { startDate, endDate } = dashboard.value.dateRange;
  if (startDate && endDate) return `${startDate} ${t.value.to} ${endDate}`;
  if (startDate) return `${t.value.from} ${startDate}`;
  return `${t.value.until} ${endDate}`;
});
const reminderTypes = computed(() => [...new Set((dashboard.value?.reminders || []).map((item) => item.type))]);
const visibleReminders = computed(() => (dashboard.value?.reminders || []).filter((item) =>
  (!reminderType.value || item.type === reminderType.value) &&
  (!reminderSeverity.value || item.severity === reminderSeverity.value)));
const displayedReminders = computed(() => showAllReminders.value ? visibleReminders.value : visibleReminders.value.slice(0, 5));

const label = (key) => t.value.labels?.[key] || key;
const unit = (key) => t.value.units?.[key] || "";
const description = (key) => t.value.descriptions?.[key] || "";
const formatNumber = (value) => new Intl.NumberFormat(locale.value).format(Number(value || 0));
const yen = (value, negative = false) => `${negative && Number(value) > 0 ? "−" : Number(value) < 0 ? "−" : ""}¥${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(Math.abs(Number(value || 0)))}`;
const formatDate = (value) => value ? new Intl.DateTimeFormat(locale.value, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "—";
const formatTime = (value) => new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit" }).format(value);
const formatDateTime = (value) => value ? new Intl.DateTimeFormat(locale.value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

async function loadOverview() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.getDashboardOverview({ startDate: draftStartDate.value, endDate: draftEndDate.value });
    dashboard.value = response.data;
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function iso(date) { return date.toISOString().slice(0, 10); }
function applyQuickFilter(key) {
  activeQuickFilter.value = key;
  const now = new Date();
  let start = null;
  let end = null;
  if (key === "thisMonth") { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  if (key === "lastMonth") { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
  if (key === "thisQuarter") { const month = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), month, 1); end = new Date(now.getFullYear(), month + 3, 0); }
  if (key === "thisYear") { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear(), 11, 31); }
  draftStartDate.value = start ? iso(start) : "";
  draftEndDate.value = end ? iso(end) : "";
  loadOverview();
}
function search() {
  if (draftStartDate.value && draftEndDate.value && draftStartDate.value > draftEndDate.value) {
    error.value = t.value.invalidRange;
    return;
  }
  activeQuickFilter.value = "";
  loadOverview();
}
function reset() { draftStartDate.value = ""; draftEndDate.value = ""; applyQuickFilter("all"); }
function navigate(route) { emit("navigate", route); }
async function markRead(reminder) {
  await api.markDashboardReminderRead(reminder.id);
  reminder.state = "read";
}
async function ignore(reminder) {
  await api.ignoreDashboardReminder(reminder.id);
  dashboard.value.reminders = dashboard.value.reminders.filter((item) => item.id !== reminder.id);
}
async function openConfig() {
  configError.value = "";
  try {
    const response = await api.getDashboardConfig();
    editableCards.value = response.cards.map((card) => ({ ...card, visibleRoles: [...card.visibleRoles] }));
    configOpen.value = true;
  } catch (e) { error.value = e.message; }
}
function validateEnabled(card) {
  if (enabledCount.value > 4) {
    card.enabled = false;
    configError.value = t.value.maxCards;
  } else configError.value = "";
}
function moveCard(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= editableCards.value.length) return;
  [editableCards.value[index], editableCards.value[target]] = [editableCards.value[target], editableCards.value[index]];
}
function parseRoles(value) { return value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean); }
async function saveConfig() {
  if (enabledCount.value > 4) { configError.value = t.value.maxCards; return; }
  savingConfig.value = true;
  configError.value = "";
  try {
    const cards = editableCards.value.map((card, index) => ({ ...card, priority: index + 1 }));
    await api.updateDashboardConfig(cards);
    configOpen.value = false;
    await loadOverview();
  } catch (e) { configError.value = e.message; } finally { savingConfig.value = false; }
}
onMounted(loadOverview);
</script>

<style scoped>
.dashboard{display:flex;flex-direction:column;gap:18px;color:#172033}.dashboard-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e5eaf0;border-radius:14px;padding:13px 14px;box-shadow:0 1px 2px rgba(15,23,42,.03)}.quick-filters{display:flex;gap:3px;background:#f3f6f8;border-radius:9px;padding:3px}.quick-filter{border:0;background:transparent;padding:8px 11px;border-radius:7px;color:#667085;font-weight:650;white-space:nowrap}.quick-filter.active{background:#fff;color:var(--primary);box-shadow:0 1px 3px rgba(15,23,42,.12)}.date-fields{display:flex;align-items:end;gap:7px}.date-fields label{display:grid;gap:4px;font-size:11px;color:#7b8797;font-weight:700}.date-fields input,.panel-filters select,.config-fields input,.config-fields select{border:1px solid #d9e0e7;background:#fff;border-radius:8px;padding:8px 10px;color:#344054}.date-separator{padding-bottom:8px;color:#98a2b3}.primary-action,.secondary-action,.icon-action{border-radius:8px;padding:9px 14px;font-weight:700;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:6px}.primary-action{background:var(--primary);color:#fff}.secondary-action,.icon-action{background:#fff;border-color:#d9e0e7;color:#475467}.icon-action{padding:9px}.config-action{margin-left:auto}.range-summary{font-size:12px;color:#667085;display:flex;align-items:center;gap:7px;padding:0 3px}.range-dot{width:7px;height:7px;border-radius:50%;background:var(--primary)}.last-updated{margin-left:auto;color:#98a2b3}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.summary-card{position:relative;display:flex;gap:13px;min-height:132px;padding:18px;text-align:left;background:#fff;border:1px solid #e3e9ef;border-radius:14px;color:#172033;box-shadow:0 2px 8px rgba(15,23,42,.04);transition:.18s ease}.summary-card:hover{border-color:color-mix(in srgb,var(--primary) 35%,#e3e9ef);transform:translateY(-1px);box-shadow:0 7px 18px rgba(15,23,42,.07)}.card-icon,.status-icon,.activity-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--primary) 10%,white);color:var(--primary);flex:0 0 auto}.card-copy{display:flex;flex-direction:column;min-width:0}.card-title{font-size:13px;color:#667085;font-weight:700}.card-copy strong{font-size:28px;line-height:1.3;margin-top:3px;letter-spacing:-.03em}.card-copy small{font-size:12px;color:#667085;font-weight:650;letter-spacing:0}.card-description{font-size:11px;color:#98a2b3;margin-top:auto}.abnormal-badge{position:absolute;right:14px;top:14px;background:#fff6ed;color:#c2410c;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:750}.card-arrow{position:absolute;right:14px;bottom:14px;color:#98a2b3}.dashboard-row{display:grid;gap:14px}.dashboard-row-primary{grid-template-columns:minmax(0,3fr) minmax(300px,2fr)}.dashboard-row-secondary{grid-template-columns:minmax(0,3fr) minmax(300px,2fr)}.dashboard-panel{background:#fff;border:1px solid #e3e9ef;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(15,23,42,.035);min-width:0}.panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.panel-header h2,.config-modal h2{margin:2px 0 0;font-size:17px;color:#172033}.section-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--primary);font-weight:800}.panel-count,.range-chip{font-size:11px;background:#f2f5f7;color:#667085;border-radius:999px;padding:5px 9px;font-weight:700}.panel-filters{display:flex;gap:8px;margin-bottom:10px}.panel-filters select{padding:7px 9px;font-size:12px}.reminder-list{display:grid}.reminder-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px 0;border-top:1px solid #edf0f3}.severity-marker{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:#f2f4f7;color:#667085}.severity-overdue .severity-marker,.severity-critical .severity-marker{background:#fef3f2;color:#d92d20}.severity-warning .severity-marker{background:#fff6ed;color:#dc6803}.reminder-heading{display:flex;align-items:center;gap:7px}.reminder-heading strong{font-size:13px}.severity-pill{font-size:9px;text-transform:uppercase;padding:3px 6px;border-radius:999px;background:#f2f4f7;color:#667085;font-weight:800}.severity-overdue .severity-pill,.severity-critical .severity-pill{background:#fef3f2;color:#b42318}.severity-warning .severity-pill{background:#fff6ed;color:#b54708}.reminder-content p{margin:4px 0 2px;font-size:12px;color:#667085}.reminder-date{font-size:10px;color:#98a2b3}.reminder-actions{display:flex;gap:5px}.reminder-actions button{border:1px solid #e0e5eb;background:#fff;border-radius:7px;padding:6px 8px;color:#475467;font-size:11px;font-weight:700}.view-all{width:100%;border:0;border-top:1px solid #edf0f3;background:#fff;color:var(--primary);font-weight:700;padding:12px 0 0}.status-list{display:grid}.status-list button{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:11px;border:0;border-top:1px solid #edf0f3;background:#fff;padding:10px 0;text-align:left;color:#475467}.status-list button:first-child{border-top:0}.status-icon{width:34px;height:34px}.status-list strong{color:#172033;font-size:16px}.status-dot{width:8px;height:8px;border-radius:50%;background:#12b76a}.status-warning{color:#dc6803!important;background:#fff6ed!important}.status-critical{color:#d92d20!important;background:#fef3f2!important}.finance-summary{display:grid;gap:14px}.finance-primary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.finance-primary>div{padding:12px;background:#f7f9fa;border-radius:10px;display:grid;gap:5px}.finance-primary span,.finance-secondary span{font-size:11px;color:#667085}.finance-primary strong{font-size:19px}.finance-primary .balance{background:color-mix(in srgb,var(--primary) 9%,white)}.finance-primary .positive{color:#067647}.finance-primary .negative{color:#b42318}.finance-secondary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:12px;border-top:1px solid #edf0f3}.finance-secondary div{display:grid;gap:3px}.finance-secondary strong{font-size:13px}.activity-list{display:grid}.activity-list button{display:flex;gap:10px;border:0;border-top:1px solid #edf0f3;background:#fff;padding:10px 0;text-align:left}.activity-list button:first-child{border-top:0}.activity-icon{width:32px;height:32px}.activity-copy{display:grid;min-width:0}.activity-copy strong{font-size:12px;color:#344054}.activity-copy span,.activity-copy small{font-size:10px;color:#667085;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.panel-empty,.restricted-state,.dashboard-state{min-height:130px;display:flex;align-items:center;justify-content:center;gap:8px;color:#98a2b3;font-size:12px}.error-state{background:#fff;border:1px solid #fecdca;border-radius:14px;color:#b42318;justify-content:flex-start;padding:20px}.error-state p{margin:3px 0}.empty-state{grid-column:1/-1}.skeleton-card{display:grid;align-content:center;gap:10px}.skeleton{display:block;background:linear-gradient(90deg,#eef1f4,#f7f8fa,#eef1f4);background-size:200% 100%;animation:shimmer 1.3s infinite;border-radius:6px}.skeleton-icon{width:38px;height:38px}.skeleton-line{width:55%;height:10px}.skeleton-value{width:35%;height:25px}@keyframes shimmer{to{background-position:-200% 0}}.modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:grid;place-items:center;padding:24px;z-index:100}.config-modal{width:min(760px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.25);color:#172033}.config-modal>header{display:flex;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #e9edf1}.config-modal header p{margin:6px 0 0;color:#667085;font-size:12px}.modal-close{border:0;background:#f2f4f7;border-radius:8px;width:34px;height:34px;font-size:22px}.inline-error{margin:14px 22px 0;padding:10px 12px;border-radius:8px;background:#fef3f2;color:#b42318;font-size:12px}.config-list{padding:12px 22px}.config-card{display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #edf0f3}.config-icon{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:#f2f7f6;color:var(--primary)}.toggle input{display:none}.toggle span{display:block;width:36px;height:20px;border-radius:999px;background:#d0d5dd;position:relative}.toggle span:after{content:"";position:absolute;width:16px;height:16px;left:2px;top:2px;border-radius:50%;background:#fff;transition:.15s}.toggle input:checked+span{background:var(--primary)}.toggle input:checked+span:after{transform:translateX(16px)}.config-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.config-fields label{display:grid;gap:4px;color:#667085;font-size:10px;font-weight:700}.sort-actions{display:flex;gap:4px}.sort-actions button{width:30px;height:30px;border:1px solid #d9e0e7;background:#fff;border-radius:7px}.config-modal footer{display:flex;align-items:center;justify-content:flex-end;gap:9px;padding:16px 22px;background:#f8fafb}.config-modal footer span{margin-right:auto;color:#667085;font-size:12px;font-weight:700}
@media(max-width:1150px){.summary-grid{grid-template-columns:repeat(2,1fr)}.dashboard-toolbar{align-items:center}.quick-filters{order:2;width:100%;overflow:auto}.date-fields label span{display:none}.config-action{margin-left:0}.dashboard-row{grid-template-columns:1fr}}
@media(max-width:680px){.dashboard{gap:12px}.summary-grid{grid-template-columns:1fr}.dashboard-toolbar{padding:10px}.date-fields{width:100%}.date-fields label{flex:1}.date-fields input{width:100%}.quick-filters{order:0}.config-action{margin-left:auto}.dashboard-panel{padding:14px}.finance-primary,.finance-secondary{grid-template-columns:1fr}.reminder-item{grid-template-columns:auto 1fr}.reminder-actions{grid-column:2}.config-fields{grid-template-columns:1fr}.config-card{grid-template-columns:auto auto 1fr}.sort-actions{grid-column:3}}
</style>
