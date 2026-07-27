<template>
  <section class="panel-card">
    <div class="panel-head">
      <div>
        <h3>系统管理</h3>
        <p>用户、角色与操作日志</p>
      </div>
      <button class="primary-button" type="button" @click="loadData">刷新</button>
    </div>

    <div class="panel-grid">
      <article class="panel-box">
        <h4>用户</h4>
        <pre>{{ JSON.stringify(users, null, 2) }}</pre>
      </article>
      <article class="panel-box">
        <h4>角色</h4>
        <pre>{{ JSON.stringify(roles, null, 2) }}</pre>
      </article>
      <article class="panel-box">
        <h4>日志</h4>
        <pre>{{ JSON.stringify(logs, null, 2) }}</pre>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';

const users = ref([]);
const roles = ref([]);
const logs = ref([]);

const loadData = async () => {
  try {
    const base = '/api/v1/rbac';
    const [usersRes, rolesRes, logsRes] = await Promise.all([
      fetch(`${base}/users`, { headers: { 'x-user-id': '1' } }).then((r) => r.json()),
      fetch(`${base}/roles`, { headers: { 'x-user-id': '1' } }).then((r) => r.json()),
      fetch(`${base}/audit-logs`, { headers: { 'x-user-id': '1' } }).then((r) => r.json()),
    ]);
    users.value = usersRes;
    roles.value = rolesRes;
    logs.value = logsRes;
  } catch (e) {
    console.error(e);
  }
};

onMounted(loadData);
</script>

<style scoped>
.panel-card { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: var(--surface); }
.panel-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.panel-grid { display:grid; gap:12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.panel-box { border:1px solid var(--line); border-radius: 12px; padding: 12px; background:#fff; overflow:auto; }
pre { white-space: pre-wrap; font-size: 12px; margin:0; }
@media (max-width: 1080px) { .panel-grid { grid-template-columns: 1fr; } }
</style>
