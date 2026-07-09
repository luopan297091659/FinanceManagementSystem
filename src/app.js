const API_BASE = window.API_BASE || "/api";

function apiPath(path) {
  return `${API_BASE}${path.replace(/^\/api/, "")}`;
}

const api = {
  async get(path) {
    const response = await fetch(apiPath(path));
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async post(path, payload) {
    const response = await fetch(apiPath(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
};

let state = {
  projects: [],
  buildings: [],
  rooms: [],
  tenants: [],
  owners: [],
  roomTenants: [],
  roomOwners: [],
  feeItems: [],
  transactions: [],
  documents: [],
  knowledgeDocuments: [],
};

function formatMoney(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function byId(list, id) {
  return list.find((item) => String(item.id) === String(id));
}

function getProjectName(room) {
  return byId(state.projects, room?.projectId)?.name || "-";
}

function getBuildingName(room) {
  return byId(state.buildings, room?.buildingId)?.name || "-";
}

function getRoomLabel(roomId) {
  const room = byId(state.rooms, roomId);
  if (!room) return "-";
  return `${getProjectName(room)} / ${getBuildingName(room)} / ${room.number}`;
}

function getRoomCoordinateLabel(room) {
  if (!room?.effectiveLatitude || !room?.effectiveLongitude) return "-";
  const source = room.coordinateSource === "room" ? "Room" : "Building";
  return `${source}: ${room.effectiveLatitude}, ${room.effectiveLongitude}`;
}

function getActiveTenant(roomId) {
  const link = state.roomTenants.find((item) => String(item.roomId) === String(roomId) && item.status === "ACTIVE");
  return link ? byId(state.tenants, link.tenantId) : null;
}

function getActiveOwner(roomId) {
  const link = state.roomOwners.find((item) => String(item.roomId) === String(roomId) && item.status === "ACTIVE");
  return link ? byId(state.owners, link.ownerId) : null;
}

function getFeeItemName(id) {
  return byId(state.feeItems, id)?.name || "-";
}

function getNumericDetailsTotal(transaction) {
  return (transaction.details || []).reduce((sum, detail) => {
    const item = byId(state.feeItems, detail.feeItemId);
    return item?.valueType === "Money" || item?.valueType === "Number"
      ? sum + (Number(detail.value) || 0)
      : sum;
  }, 0);
}

function statusPill(status) {
  const map = {
    OCCUPIED: ["入居中", ""],
    VACANT: ["空室", "warning"],
    MAINTENANCE: ["维修中", "danger"],
    ACTIVE: ["有效", ""],
    ENDED: ["已结束", "warning"],
  };
  const [label, tone] = map[status] || [status || "-", ""];
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderOptions(select, options, placeholder = "请选择") {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>${options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("")}`;
}

function renderRoomSelects() {
  const roomOptions = state.rooms.map((room) => ({
    value: room.id,
    label: getRoomLabel(room.id),
  }));
  ["binding-room", "transaction-room", "ocr-room"].forEach((id) => renderOptions(document.getElementById(id), roomOptions));
}

function renderBindingCustomers() {
  const kind = document.getElementById("binding-kind").value;
  const customers = kind === "tenant" ? state.tenants : state.owners;
  renderOptions(
    document.getElementById("binding-customer"),
    customers.map((customer) => ({ value: customer.id, label: customer.name })),
  );
}

function renderMetrics() {
  document.getElementById("metric-rooms").textContent = state.rooms.length;
  document.getElementById("metric-occupied").textContent = state.rooms.filter((room) => room.status === "OCCUPIED").length;
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthIncome = state.transactions
    .filter((tx) => tx.type === "income" && tx.date.startsWith(monthPrefix))
    .reduce((sum, tx) => sum + getNumericDetailsTotal(tx), 0);
  const monthExpense = state.transactions
    .filter((tx) => tx.type === "expense" && tx.date.startsWith(monthPrefix))
    .reduce((sum, tx) => sum + getNumericDetailsTotal(tx), 0);
  document.getElementById("metric-income").textContent = formatMoney(monthIncome);
  document.getElementById("metric-expense").textContent = formatMoney(monthExpense);
}

function renderDashboard() {
  const roomList = document.getElementById("room-core-list");
  roomList.innerHTML = state.rooms
    .map((room) => {
      const tenant = getActiveTenant(room.id);
      const owner = getActiveOwner(room.id);
      return `
        <article class="room-card">
          <header>
            <strong>${escapeHtml(getBuildingName(room))}-${escapeHtml(room.number)}</strong>
            ${statusPill(room.status)}
          </header>
          <div class="room-meta">
            <span>项目：${escapeHtml(getProjectName(room))}</span>
            <span>租客：${escapeHtml(tenant?.name || "-")}</span>
            <span>业主：${escapeHtml(owner?.name || "-")}</span>
          </div>
        </article>
      `;
    })
    .join("") || `<div class="empty">暂无房间</div>`;

  const transactions = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.getElementById("recent-transactions").innerHTML = transactions
    .map((tx) => `
      <article class="timeline-item">
        <header>
          <strong>${tx.type === "income" ? "入金" : "出金"} ${formatMoney(getNumericDetailsTotal(tx))}</strong>
          <span>${escapeHtml(tx.date)}</span>
        </header>
        <p>${escapeHtml(getRoomLabel(tx.roomId))} · ${escapeHtml(tx.counterparty || "-")} · ${escapeHtml(tx.note || "-")}</p>
      </article>
    `)
    .join("") || `<div class="empty">暂无财务记录</div>`;
}

function renderRooms() {
  document.getElementById("rooms-table").innerHTML = `
    <div class="table-row header wide"><span>项目</span><span>楼栋 / 房号</span><span>面积 / 楼层</span><span>状态</span></div>
    ${state.rooms
      .map((room) => `
        <div class="table-row wide">
          <span>${escapeHtml(getProjectName(room))}</span>
          <span>${escapeHtml(getBuildingName(room))} / ${escapeHtml(room.number)}</span>
          <span>${escapeHtml(room.area || "-")}㎡ / ${escapeHtml(room.floor || "-")}F<br>${escapeHtml(getRoomCoordinateLabel(room))}</span>
          <span>${statusPill(room.status)}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无房间</div>`}
  `;
}

function renderBindings() {
  const tenantRows = state.roomTenants.map((link) => ({
    room: getRoomLabel(link.roomId),
    kind: "租客",
    name: byId(state.tenants, link.tenantId)?.name || "-",
    period: `${link.startDate || "-"} ~ ${link.endDate || "现在"}`,
    status: link.status,
  }));
  const ownerRows = state.roomOwners.map((link) => ({
    room: getRoomLabel(link.roomId),
    kind: "业主",
    name: byId(state.owners, link.ownerId)?.name || "-",
    period: `${link.startDate || "-"} ~ ${link.endDate || "现在"}`,
    status: link.status,
  }));
  document.getElementById("bindings-table").innerHTML = `
    <div class="table-row wide header"><span>房间</span><span>类型</span><span>客户</span><span>期间</span></div>
    ${[...tenantRows, ...ownerRows]
      .map((row) => `
        <div class="table-row wide">
          <span>${escapeHtml(row.room)}</span>
          <span>${escapeHtml(row.kind)} ${statusPill(row.status)}</span>
          <span>${escapeHtml(row.name)}</span>
          <span>${escapeHtml(row.period)}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无绑定</div>`}
  `;
}

function getAvailableFeeItems(type) {
  return state.feeItems
    .filter((item) => item.enabled && (item.category === type || item.category === "both"))
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
}

function renderDetailRow(selectedId = "", value = "") {
  const type = document.getElementById("transaction-type").value;
  const options = getAvailableFeeItems(type)
    .map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.valueType)}</option>`)
    .join("");
  const row = document.createElement("div");
  row.className = "detail-row";
  row.innerHTML = `
    <select name="feeItemId">${options}</select>
    <input name="value" value="${escapeHtml(value)}" placeholder="金额、数字、文字或日期" />
  `;
  return row;
}

function resetTransactionDetails() {
  const container = document.getElementById("transaction-details");
  container.innerHTML = "";
  container.appendChild(renderDetailRow());
}

function renderTransactions() {
  document.getElementById("transactions-table").innerHTML = `
    <div class="table-row wide header"><span>日期</span><span>类型 / 房间</span><span>对象</span><span>明细</span></div>
    ${state.transactions
      .map((tx) => `
        <div class="table-row wide">
          <span>${escapeHtml(tx.date)}</span>
          <span>${tx.type === "income" ? "入金" : "出金"}<br>${escapeHtml(getRoomLabel(tx.roomId))}</span>
          <span>${escapeHtml(tx.counterparty || "-")}</span>
          <span>${(tx.details || []).map((detail) => `${escapeHtml(getFeeItemName(detail.feeItemId))}：${escapeHtml(detail.value)}`).join("<br>")}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无财务记录</div>`}
  `;
}

function renderDocuments() {
  document.getElementById("documents-table").innerHTML = `
    <div class="table-row wide header"><span>文件</span><span>房间</span><span>类型</span><span>识别字段</span></div>
    ${state.documents
      .map((doc) => `
        <div class="table-row wide">
          <span>${escapeHtml(doc.fileName)}</span>
          <span>${escapeHtml(getRoomLabel(doc.roomId))}</span>
          <span>${escapeHtml(doc.documentType)}</span>
          <span>${escapeHtml(doc.extractedText || "-")}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无文件</div>`}
  `;

  document.getElementById("knowledge-table").innerHTML = `
    <div class="table-row header"><span>知识文档</span><span>房间</span><span>来源</span></div>
    ${state.knowledgeDocuments
      .map((doc) => `
        <div class="table-row">
          <span>${escapeHtml(doc.title)}</span>
          <span>${escapeHtml(getRoomLabel(doc.roomId))}</span>
          <span>${escapeHtml(doc.sourceType)}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无知识文档</div>`}
  `;
}

function renderFeeItems() {
  document.getElementById("fee-items-table").innerHTML = `
    <div class="table-row wide header"><span>名称</span><span>类别</span><span>类型</span><span>状态</span></div>
    ${state.feeItems
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
      .map((item) => `
        <div class="table-row wide">
          <span>${escapeHtml(item.name)}</span>
          <span>${escapeHtml(item.category)}</span>
          <span>${escapeHtml(item.valueType)}</span>
          <span>${item.enabled ? "启用" : "停用"}</span>
        </div>
      `)
      .join("") || `<div class="empty">暂无费用项</div>`}
  `;
}

function renderAll() {
  renderRoomSelects();
  renderBindingCustomers();
  renderMetrics();
  renderDashboard();
  renderRooms();
  renderBindings();
  renderTransactions();
  renderDocuments();
  renderFeeItems();
}

async function refresh() {
  state = await api.get("/api/bootstrap");
  renderAll();
}

async function submitJson(event, path, payloadBuilder, afterSubmit) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = payloadBuilder(Object.fromEntries(new FormData(form)));
  await api.post(path, payload);
  form.reset();
  if (afterSubmit) afterSubmit();
  await refresh();
}

document.querySelectorAll(".nav-item, [data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const viewId = button.dataset.view || button.dataset.viewJump;
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
    document.getElementById("page-title").textContent = button.textContent.trim();
  });
});

document.getElementById("reset-demo").addEventListener("click", async () => {
  await api.post("/api/reset", {});
  resetTransactionDetails();
  await refresh();
});

document.getElementById("room-form").addEventListener("submit", (event) =>
  submitJson(event, "/api/rooms", (data) => ({
    projectName: data.projectName.trim(),
    buildingName: data.buildingName.trim(),
    buildingLatitude: data.buildingLatitude,
    buildingLongitude: data.buildingLongitude,
    roomNumber: data.roomNumber.trim(),
    area: data.area,
    floor: data.floor,
    roomLatitude: data.roomLatitude,
    roomLongitude: data.roomLongitude,
    status: data.status,
    note: data.note,
  })),
);

document.getElementById("customer-kind").addEventListener("change", (event) => {
  document.getElementById("owner-type-field").classList.toggle("hidden", event.target.value !== "owner");
});

document.getElementById("customer-form").addEventListener("submit", (event) =>
  submitJson(
    event,
    "/api/customers",
    (data) => ({
      kind: data.kind,
      ownerType: data.ownerType || "PERSON",
      name: data.name,
      kana: data.kana,
      nationality: data.nationality,
      phone: data.phone,
      email: data.email,
      birthDate: data.birthDate,
      occupation: data.occupation,
      annualIncome: data.annualIncome,
      address: data.address,
      attachments: data.attachments,
    }),
    () => document.getElementById("owner-type-field").classList.add("hidden"),
  ),
);

document.getElementById("binding-kind").addEventListener("change", renderBindingCustomers);
document.getElementById("binding-form").addEventListener("submit", (event) =>
  submitJson(event, "/api/bindings", (data) => ({
    kind: data.kind,
    roomId: data.roomId,
    customerId: data.customerId,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
  })),
);

document.getElementById("transaction-type").addEventListener("change", resetTransactionDetails);
document.getElementById("add-detail").addEventListener("click", () => {
  document.getElementById("transaction-details").appendChild(renderDetailRow());
});
document.getElementById("transaction-form").addEventListener("submit", (event) =>
  submitJson(
    event,
    "/api/transactions",
    (data) => ({
      type: data.type,
      date: data.date,
      roomId: data.roomId,
      counterparty: data.counterparty,
      note: data.note,
      details: [...document.querySelectorAll(".detail-row")]
        .map((row) => ({
          feeItemId: row.querySelector('[name="feeItemId"]').value,
          value: row.querySelector('[name="value"]').value,
        }))
        .filter((detail) => detail.feeItemId && detail.value !== ""),
    }),
    () => {
      document.querySelector('#transaction-form [name="date"]').value = new Date().toISOString().slice(0, 10);
      resetTransactionDetails();
    },
  ),
);

document.getElementById("ocr-form").addEventListener("submit", (event) =>
  submitJson(event, "/api/documents", (data) => ({
    fileName: data.fileName || "未命名文件",
    roomId: data.roomId,
    documentType: data.documentType,
    extractedText: data.extractedText,
  })),
);

document.getElementById("ask-ai").addEventListener("click", () => {
  const query = document.getElementById("knowledge-query").value.trim();
  const room = state.rooms.find((item) => query.includes(item.number));
  const tenant = state.tenants.find((item) => query.includes(item.name));
  const relatedRoomId = room?.id || state.roomTenants.find((link) => String(link.tenantId) === String(tenant?.id))?.roomId;
  const relatedTransactions = state.transactions.filter((tx) => !relatedRoomId || String(tx.roomId) === String(relatedRoomId));
  const income = relatedTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + getNumericDetailsTotal(tx), 0);
  const expense = relatedTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + getNumericDetailsTotal(tx), 0);
  document.getElementById("knowledge-answer").textContent = relatedRoomId
    ? `${getRoomLabel(relatedRoomId)} 当前租客：${getActiveTenant(relatedRoomId)?.name || "-"}，业主：${getActiveOwner(relatedRoomId)?.name || "-"}。已记录入金 ${formatMoney(income)}，出金 ${formatMoney(expense)}。`
    : `已记录 ${state.rooms.length} 个房间、${state.transactions.length} 笔财务记录。请输入房号或客户姓名可查询关联数据。`;
});

document.getElementById("fee-item-form").addEventListener("submit", (event) =>
  submitJson(
    event,
    "/api/fee-items",
    (data) => ({
      name: data.name,
      category: data.category,
      valueType: data.valueType,
      sortOrder: Number(data.sortOrder) || 0,
      enabled: data.enabled === "true",
    }),
    resetTransactionDetails,
  ),
);

document.querySelector('#transaction-form [name="date"]').value = new Date().toISOString().slice(0, 10);
resetTransactionDetails();
refresh().catch((error) => {
  document.body.innerHTML = `<main class="workspace"><section class="panel"><h1>启动失败</h1><p>${escapeHtml(error.message)}</p><p>请使用 <code>python server.py</code> 启动项目。</p></section></main>`;
});
