const API_BASE = window.API_BASE || "/api/v1";

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
  async put(path, payload) {
    const response = await fetch(apiPath(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async delete(path) {
    const response = await fetch(apiPath(path), { method: "DELETE" });
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

const GIS_STYLE_URL = "https://api.maptiler.com/maps/jp-gsi-standard/style.json?key=z957GVzlIZ4zQdQ4as3E";
const OSAKA_STATION_COORDINATES = [135.495951, 34.702485];
let gisMap;

function initializeGisMap() {
  const mapContainer = document.getElementById("gis-map");
  if (!mapContainer || gisMap) {
    if (gisMap) gisMap.resize();
    return;
  }

  if (!window.maplibregl) {
    mapContainer.innerHTML = '<div class="empty">地图资源加载失败，请检查网络连接。</div>';
    return;
  }

  const maplibre = window.maplibregl;

  gisMap = new maplibre.Map({
    container: mapContainer,
    style: GIS_STYLE_URL,
    center: OSAKA_STATION_COORDINATES,
    zoom: 10,
  });

  gisMap.addControl(new maplibre.NavigationControl(), "top-right");
  gisMap.addControl(new maplibre.FullscreenControl(), "top-right");
  gisMap.addControl(
    new maplibre.ScaleControl({
      maxWidth: 160,
      unit: "metric",
    }),
    "bottom-left",
  );
}

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

function errorMessage(error) {
  try {
    return JSON.parse(error.message).error || error.message;
  } catch {
    return error.message;
  }
}

function setFormValue(form, name, value) {
  const field = form.elements[name];
  if (field) field.value = value ?? "";
}

function setEditMode(formId, active, label) {
  const submit = document.getElementById(`${formId}-submit`);
  const cancel = document.getElementById(`${formId}-cancel-edit`);
  if (submit) submit.textContent = active ? `更新${label}` : `保存${label}`;
  if (cancel) cancel.classList.toggle("hidden", !active);
}

function customerPayload(data) {
  return {
    kind: data.kind,
    ownerType: data.ownerType || "PERSON",
    customerCode: data.customerCode.trim(),
    name: data.name.trim(),
    kana: data.kana,
    nationality: data.nationality,
    phone: data.phone.trim(),
    email: data.email.trim(),
    birthDate: data.birthDate,
    occupation: data.occupation,
    annualIncome: data.annualIncome,
    address: data.address,
    attachments: data.attachments,
  };
}

function roomPayload(data) {
  return {
    projectName: data.projectName.trim(),
    buildingName: data.buildingName.trim(),
    buildingLatitude: data.buildingLatitude,
    buildingLongitude: data.buildingLongitude,
    houseNumber: data.houseNumber.trim(),
    roomNumber: data.roomNumber.trim(),
    area: data.area,
    floor: data.floor,
    roomLatitude: data.roomLatitude,
    roomLongitude: data.roomLongitude,
    status: data.status,
    note: data.note,
  };
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
  const house = room.houseNumber ? `${room.houseNumber} / ` : "";
  return `${getProjectName(room)} / ${getBuildingName(room)} / ${house}${room.number}`;
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
    <div class="table-row header rooms"><span>项目</span><span>房屋编号 / 房号</span><span>面积 / 楼层</span><span>状态</span><span>操作</span></div>
    ${state.rooms
      .map((room) => `
        <div class="table-row rooms">
          <span>${escapeHtml(getProjectName(room))}</span>
          <span>${escapeHtml(room.houseNumber || "-")}<br>${escapeHtml(getBuildingName(room))} / ${escapeHtml(room.number)}</span>
          <span>${escapeHtml(room.area || "-")}㎡ / ${escapeHtml(room.floor || "-")}F<br>${escapeHtml(getRoomCoordinateLabel(room))}</span>
          <span>${statusPill(room.status)}</span>
          <span class="row-actions">
            <button class="ghost-button mini" type="button" data-edit-room="${escapeHtml(room.id)}">编辑</button>
            <button class="danger-button mini" type="button" data-delete-room="${escapeHtml(room.id)}">删除</button>
          </span>
        </div>
      `)
      .join("") || `<div class="empty">暂无房间</div>`}
  `;
}

function renderCustomers() {
  const rows = [
    ...state.tenants.map((customer) => ({ ...customer, kind: "tenant", kindLabel: "租客" })),
    ...state.owners.map((customer) => ({ ...customer, kind: "owner", kindLabel: "业主" })),
  ].sort((a, b) => String(a.customerCode || "").localeCompare(String(b.customerCode || "")));

  document.getElementById("customers-table").innerHTML = `
    <div class="table-row header customers"><span>客户编号</span><span>类型 / 名称</span><span>电话 / 邮箱</span><span>地址</span><span>操作</span></div>
    ${rows
      .map((customer) => `
        <div class="table-row customers">
          <span>${escapeHtml(customer.customerCode || "-")}</span>
          <span>${escapeHtml(customer.kindLabel)}<br>${escapeHtml(customer.name)}</span>
          <span>${escapeHtml(customer.phone || "-")}<br>${escapeHtml(customer.email || "-")}</span>
          <span>${escapeHtml(customer.address || "-")}</span>
          <span class="row-actions">
            <button class="ghost-button mini" type="button" data-edit-customer="${escapeHtml(customer.kind)}:${escapeHtml(customer.id)}">编辑</button>
            <button class="danger-button mini" type="button" data-delete-customer="${escapeHtml(customer.id)}">删除</button>
          </span>
        </div>
      `)
      .join("") || `<div class="empty">暂无客户</div>`}
  `;
}

function renderBindings() {
  const tenantRows = state.roomTenants.map((link) => ({
    id: link.id,
    kind: "tenant",
    kindLabel: "租客",
    customerId: link.tenantId,
    room: getRoomLabel(link.roomId),
    name: byId(state.tenants, link.tenantId)?.name || "-",
    period: `${link.startDate || "-"} ~ ${link.endDate || "现在"}`,
    status: link.status,
  }));
  const ownerRows = state.roomOwners.map((link) => ({
    id: link.id,
    kind: "owner",
    kindLabel: "业主",
    customerId: link.ownerId,
    room: getRoomLabel(link.roomId),
    name: byId(state.owners, link.ownerId)?.name || "-",
    period: `${link.startDate || "-"} ~ ${link.endDate || "现在"}`,
    status: link.status,
  }));
  document.getElementById("bindings-table").innerHTML = `
    <div class="table-row header bindings"><span>房间</span><span>类型</span><span>客户</span><span>期间</span><span>操作</span></div>
    ${[...tenantRows, ...ownerRows]
      .map((row) => `
        <div class="table-row bindings">
          <span>${escapeHtml(row.room)}</span>
          <span>${escapeHtml(row.kindLabel || row.kind)} ${statusPill(row.status)}</span>
          <span>${escapeHtml(row.name)}</span>
          <span>${escapeHtml(row.period)}</span>
          <span class="row-actions">
            <button class="ghost-button mini" type="button" data-edit-binding="${escapeHtml(row.kind)}:${escapeHtml(row.id)}">编辑</button>
            <button class="danger-button mini" type="button" data-delete-binding="${escapeHtml(row.id)}">删除</button>
          </span>
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
  renderCustomers();
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
  try {
    await api.post(path, payload);
    form.reset();
    if (afterSubmit) afterSubmit();
    await refresh();
  } catch (error) {
    alert(errorMessage(error));
  }
}

async function submitEntity(event, path, payloadBuilder, label, afterSubmit) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const payload = payloadBuilder(data);
  try {
    if (data.id) {
      await api.put(`${path}/${encodeURIComponent(data.id)}`, payload);
    } else {
      await api.post(path, payload);
    }
    form.reset();
    setEditMode(form.id.replace("-form", ""), false, label);
    if (afterSubmit) afterSubmit();
    await refresh();
  } catch (error) {
    alert(errorMessage(error));
  }
}

document.querySelectorAll(".nav-item, [data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const viewId = button.dataset.view || button.dataset.viewJump;
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
    document.getElementById("page-title").textContent = button.textContent.trim();
    if (viewId === "gis") {
      window.requestAnimationFrame(initializeGisMap);
    }
  });
});

document.getElementById("reset-demo").addEventListener("click", async () => {
  await api.post("/api/reset", {});
  resetTransactionDetails();
  await refresh();
});

document.getElementById("room-form").addEventListener("submit", (event) =>
  submitEntity(event, "/api/rooms", roomPayload, "房间"),
);

document.getElementById("customer-kind").addEventListener("change", (event) => {
  document.getElementById("owner-type-field").classList.toggle("hidden", event.target.value !== "owner");
});

document.getElementById("customer-form").addEventListener("submit", (event) =>
  submitEntity(
    event,
    "/api/customers",
    customerPayload,
    "客户",
    () => document.getElementById("owner-type-field").classList.add("hidden"),
  ),
);

document.getElementById("binding-kind").addEventListener("change", renderBindingCustomers);
document.getElementById("binding-form").addEventListener("submit", (event) =>
  submitEntity(event, "/api/bindings", (data) => ({
    kind: data.kind,
    roomId: data.roomId,
    customerId: data.customerId,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
  }), "绑定"),
);

document.getElementById("room-cancel-edit").addEventListener("click", () => {
  document.getElementById("room-form").reset();
  setEditMode("room", false, "房间");
});

document.getElementById("customer-cancel-edit").addEventListener("click", () => {
  document.getElementById("customer-form").reset();
  document.getElementById("owner-type-field").classList.add("hidden");
  setEditMode("customer", false, "客户");
});

document.getElementById("binding-cancel-edit").addEventListener("click", () => {
  document.getElementById("binding-form").reset();
  renderBindingCustomers();
  setEditMode("binding", false, "绑定");
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.editRoom) {
    const room = byId(state.rooms, button.dataset.editRoom);
    const building = byId(state.buildings, room?.buildingId);
    const project = byId(state.projects, room?.projectId);
    const form = document.getElementById("room-form");
    setFormValue(form, "id", room.id);
    setFormValue(form, "projectName", project?.name);
    setFormValue(form, "buildingName", building?.name);
    setFormValue(form, "buildingLatitude", building?.latitude);
    setFormValue(form, "buildingLongitude", building?.longitude);
    setFormValue(form, "houseNumber", room.houseNumber);
    setFormValue(form, "roomNumber", room.number);
    setFormValue(form, "area", room.area);
    setFormValue(form, "floor", room.floor);
    setFormValue(form, "roomLatitude", room.latitude);
    setFormValue(form, "roomLongitude", room.longitude);
    setFormValue(form, "status", room.status);
    setFormValue(form, "note", room.note);
    setEditMode("room", true, "房间");
    document.querySelector('[data-view="resources"]').click();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.dataset.editCustomer) {
    const [kind, id] = button.dataset.editCustomer.split(":");
    const customer = byId(kind === "tenant" ? state.tenants : state.owners, id);
    const form = document.getElementById("customer-form");
    setFormValue(form, "id", customer.id);
    setFormValue(form, "kind", kind);
    setFormValue(form, "ownerType", customer.ownerType || "PERSON");
    setFormValue(form, "customerCode", customer.customerCode);
    setFormValue(form, "name", customer.name);
    setFormValue(form, "kana", customer.kana);
    setFormValue(form, "nationality", customer.nationality);
    setFormValue(form, "phone", customer.phone);
    setFormValue(form, "email", customer.email);
    setFormValue(form, "birthDate", customer.birthDate);
    setFormValue(form, "occupation", customer.occupation);
    setFormValue(form, "annualIncome", customer.annualIncome);
    setFormValue(form, "address", customer.address);
    setFormValue(form, "attachments", customer.attachments);
    document.getElementById("owner-type-field").classList.toggle("hidden", kind !== "owner");
    setEditMode("customer", true, "客户");
    document.querySelector('[data-view="customers"]').click();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.dataset.editBinding) {
    const [kind, id] = button.dataset.editBinding.split(":");
    const list = kind === "tenant" ? state.roomTenants : state.roomOwners;
    const link = byId(list, id);
    const form = document.getElementById("binding-form");
    setFormValue(form, "id", link.id);
    setFormValue(form, "kind", kind);
    renderBindingCustomers();
    setFormValue(form, "roomId", link.roomId);
    setFormValue(form, "customerId", kind === "tenant" ? link.tenantId : link.ownerId);
    setFormValue(form, "startDate", link.startDate);
    setFormValue(form, "endDate", link.endDate);
    setFormValue(form, "status", link.status);
    setEditMode("binding", true, "绑定");
    document.querySelector('[data-view="customers"]').click();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const deleteTarget =
    button.dataset.deleteRoom && { path: `/api/rooms/${button.dataset.deleteRoom}`, text: "确认删除该房间及其绑定关系？" } ||
    button.dataset.deleteCustomer && { path: `/api/customers/${button.dataset.deleteCustomer}`, text: "确认删除该客户及其绑定关系？" } ||
    button.dataset.deleteBinding && { path: `/api/bindings/${button.dataset.deleteBinding}`, text: "确认删除该绑定？" };

  if (deleteTarget && window.confirm(deleteTarget.text)) {
    try {
      await api.delete(deleteTarget.path);
      await refresh();
    } catch (error) {
      alert(errorMessage(error));
    }
  }
});

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
  document.body.innerHTML = `<main class="workspace"><section class="panel"><h1>启动失败</h1><p>${escapeHtml(error.message)}</p><p>请使用 <code>npm.cmd run dev</code> 启动 Nest 后端。</p></section></main>`;
});
