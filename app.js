// app.js (Ingress rewrite-target: /$2 compatible)
const cfg = window.APP_CONFIG;

// ==============================
// Helpers: URL + Auth
// ==============================
function apiUrl(basePath, path = "") {
  const base = String(basePath || "").replace(/\/+$/, ""); // "/alerts"
  const p = String(path || "");
  const fullPath = base + (p ? (p.startsWith("/") ? p : "/" + p) : "");
  return new URL(fullPath, window.location.origin).toString();
}

const token = localStorage.getItem("agro_token");
if (!token) window.location.href = "login.html";

document.getElementById("whoami").textContent = localStorage.getItem("agro_email") || "";

document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("agro_token");
  localStorage.removeItem("agro_email");
  window.location.href = "login.html";
});

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

// ==============================
// Alerts
// ==============================
function buildAlertsUrl() {
  const severity = document.getElementById("severity").value;
  const ack = document.getElementById("ack").value;
  const plotId = document.getElementById("filterPlotId").value.trim();

  // CHAVE: /alerts/alerts  -> rewrite tira o primeiro /alerts e sobra /alerts no backend
  const url = new URL(apiUrl(cfg.ALERTS_BASE_URL, "/alerts"));

  if (severity) url.searchParams.set("severity", severity);
  if (ack) url.searchParams.set("ack", ack);
  if (plotId) url.searchParams.set("plotId", plotId);

  return url.toString();
}

async function loadAlerts() {
  const alertsBody = document.getElementById("alertsBody");
  const alertsMsg = document.getElementById("alertsMsg");
  alertsBody.innerHTML = "";
  alertsMsg.textContent = "Carregando...";

  try {
    const res = await fetch(buildAlertsUrl(), { headers: { ...authHeaders() } });
    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const items = await res.json();
    alertsMsg.textContent = items.length ? "" : "Nenhum alerta encontrado.";

    for (const a of items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge ${
          a.severity === "CRITICAL"
            ? "bg-danger"
            : a.severity === "WARN"
              ? "bg-warning text-dark"
              : "bg-secondary"
        }">${a.severity}</span></td>
        <td>${a.type}</td>
        <td>${a.soilMoisture}</td>
        <td class="mono">${a.plotId}</td>
        <td>${new Date(a.createdAt).toLocaleString()}</td>
        <td>${a.acknowledged ? "✅ Resolvido" : "⏳ Pendente"}</td>
        <td>
          ${a.acknowledged ? "" : `<button class="btn btn-sm btn-outline-success" data-ack="${a.id}">Marcar como resolvido</button>`}
        </td>
      `;
      alertsBody.appendChild(tr);
    }

    document.querySelectorAll("button[data-ack]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-ack");
        await ackAlert(id);
        await loadAlerts();
      });
    });
  } catch (e) {
    alertsMsg.textContent = "Erro ao carregar alertas: " + e.message;
  }
}

async function ackAlert(id) {
  // /alerts/alerts/{id}/ack -> rewrite => /alerts/{id}/ack
  await fetch(apiUrl(cfg.ALERTS_BASE_URL, `/alerts/${id}/ack`), {
    method: "PUT",
    headers: { ...authHeaders() }
  });
}

document.getElementById("btnRefresh").addEventListener("click", loadAlerts);
["severity", "ack", "filterPlotId"].forEach(id => {
  document.getElementById(id).addEventListener("change", loadAlerts);
});

// ==============================
// Histórico (Chart.js)
// ==============================
let historyChart = null;

async function loadHistory() {
  const historyMsg = document.getElementById("historyMsg");
  const canvas = document.getElementById("historyChart");
  if (!historyMsg || !canvas) return;

  historyMsg.textContent = "Carregando histórico...";

  const plotId = document.getElementById("plotId").value.trim();
  if (!plotId) {
    historyMsg.textContent = "Selecione um talhão ou informe o ID do talhão.";
    return;
  }

  try {
    // /telemetry/telemetry/readings -> rewrite => /telemetry/readings
    const url = new URL(apiUrl(cfg.TELEMETRY_BASE_URL, "/telemetry/readings"));
    url.searchParams.set("plotId", plotId);
    url.searchParams.set("take", "200");

    const res = await fetch(url.toString(), { headers: { ...authHeaders() } });
    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const items = await res.json();
    if (!items.length) {
      historyMsg.textContent = "Sem histórico para este talhão.";
      if (historyChart) { historyChart.destroy(); historyChart = null; }
      return;
    }

    const labels = items.map(x => new Date(x.timestamp).toLocaleString());
    const moisture = items.map(x => Number(x.soilMoisture));
    const temp = items.map(x => Number(x.temperatureC));
    const rain = items.map(x => Number(x.precipitationMm));

    if (historyChart) historyChart.destroy();

    historyChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Umidade do Solo", data: moisture, tension: 0.25 },
          { label: "Temp (C)", data: temp, tension: 0.25 },
          { label: "Precip (mm)", data: rain, tension: 0.25 }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: { y: { beginAtZero: true } }
      }
    });

    historyMsg.textContent = `OK — ${items.length} ponto(s) carregado(s).`;
  } catch (e) {
    historyMsg.textContent = "Erro ao carregar histórico: " + e.message;
  }
}

document.getElementById("btnLoadHistory")?.addEventListener("click", loadHistory);

// ==============================
// Propriedades & Talhões (GET)
// ==============================
async function loadProperties() {
  const sel = document.getElementById("propertySelect");
  const plotSel = document.getElementById("plotSelect");
  const btnNewPlot = document.getElementById("btnNewPlot");
  if (!sel || !plotSel) return;

  sel.innerHTML = `<option value="">Carregando...</option>`;
  plotSel.innerHTML = `<option value="">Selecione uma propriedade primeiro</option>`;
  plotSel.disabled = true;
  if (btnNewPlot) btnNewPlot.disabled = true;

  try {
    // /properties/properties -> rewrite => /properties
    const res = await fetch(apiUrl(cfg.PROPERTIES_BASE_URL, "/properties"), { headers: { ...authHeaders() } });
    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const items = await res.json();
    sel.innerHTML = `<option value="">Selecione...</option>`;

    for (const p of items) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} — ${p.location}`;
      sel.appendChild(opt);
    }

    if (items.length === 0) sel.innerHTML = `<option value="">Nenhuma propriedade cadastrada</option>`;
  } catch (e) {
    sel.innerHTML = `<option value="">Erro ao carregar propriedades</option>`;
    console.error(e);
  }
}

async function loadPlots(propertyId) {
  const plotSel = document.getElementById("plotSelect");
  if (!plotSel) return;

  plotSel.disabled = true;
  plotSel.innerHTML = `<option value="">Carregando talhões...</option>`;

  try {
    // /properties/properties/{id}/plots -> rewrite => /properties/{id}/plots
    const res = await fetch(apiUrl(cfg.PROPERTIES_BASE_URL, `/properties/${propertyId}/plots`), { headers: { ...authHeaders() } });
    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const items = await res.json();
    plotSel.innerHTML = `<option value="">Selecione...</option>`;

    for (const pl of items) {
      const opt = document.createElement("option");
      opt.value = pl.id;
      opt.textContent = `${pl.name} — ${pl.crop} (${pl.status})`;
      plotSel.appendChild(opt);
    }

    if (items.length === 0) {
      plotSel.innerHTML = `<option value="">Nenhum talhão cadastrado</option>`;
      plotSel.disabled = true;
    } else {
      plotSel.disabled = false;
    }
  } catch (e) {
    plotSel.innerHTML = `<option value="">Erro ao carregar talhões</option>`;
    plotSel.disabled = true;
    console.error(e);
  }
}

document.getElementById("propertySelect")?.addEventListener("change", async (ev) => {
  const propertyId = ev.target.value;
  const plotSel = document.getElementById("plotSelect");
  const btnNewPlot = document.getElementById("btnNewPlot");

  if (btnNewPlot) btnNewPlot.disabled = !propertyId;

  if (!propertyId) {
    plotSel.innerHTML = `<option value="">Selecione uma propriedade primeiro</option>`;
    plotSel.disabled = true;
    return;
  }
  await loadPlots(propertyId);
});

document.getElementById("plotSelect")?.addEventListener("change", async (ev) => {
  const plotId = ev.target.value;
  if (!plotId) return;

  document.getElementById("plotId").value = plotId;
  document.getElementById("filterPlotId").value = plotId;

  await loadAlerts();
  await loadHistory();
  await refreshPlotStatus(plotId);
});

// ==============================
// Criar Propriedade / Talhão (POST)
// ==============================
let modalProperty = null;
let modalPlot = null;

function initModals() {
  if (window.bootstrap) {
    modalProperty = new bootstrap.Modal(document.getElementById("modalProperty"));
    modalPlot = new bootstrap.Modal(document.getElementById("modalPlot"));
  }
}

function showInlineError(elId, text) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.classList.remove("d-none");
}

function clearInlineError(elId) {
  const el = document.getElementById(elId);
  el.classList.add("d-none");
  el.textContent = "";
}

document.getElementById("btnNewProperty")?.addEventListener("click", () => {
  clearInlineError("propMsg");
  document.getElementById("propName").value = "";
  document.getElementById("propLocation").value = "";
  modalProperty?.show();
});

document.getElementById("btnSaveProperty")?.addEventListener("click", async () => {
  clearInlineError("propMsg");

  const name = document.getElementById("propName").value.trim();
  const location = document.getElementById("propLocation").value.trim();

  if (!name || !location) {
    showInlineError("propMsg", "Informe nome e localização.");
    return;
  }

  try {
    const res = await fetch(apiUrl(cfg.PROPERTIES_BASE_URL, "/properties"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, location })
    });

    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    modalProperty?.hide();
    await loadProperties();
  } catch (e) {
    showInlineError("propMsg", "Erro ao salvar: " + e.message);
  }
});

document.getElementById("btnNewPlot")?.addEventListener("click", () => {
  clearInlineError("plotMsg");
  document.getElementById("plotName").value = "";
  document.getElementById("plotCrop").value = "";
  modalPlot?.show();
});

document.getElementById("btnSavePlot")?.addEventListener("click", async () => {
  clearInlineError("plotMsg");

  const propertyId = document.getElementById("propertySelect").value;
  const name = document.getElementById("plotName").value.trim();
  const crop = document.getElementById("plotCrop").value.trim();

  if (!propertyId) {
    showInlineError("plotMsg", "Selecione uma propriedade antes.");
    return;
  }
  if (!name || !crop) {
    showInlineError("plotMsg", "Informe nome e cultura.");
    return;
  }

  try {
    const res = await fetch(apiUrl(cfg.PROPERTIES_BASE_URL, `/properties/${propertyId}/plots`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, crop })
    });

    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    modalPlot?.hide();
    await loadPlots(propertyId);
  } catch (e) {
    showInlineError("plotMsg", "Erro ao salvar: " + e.message);
  }
});

// ==============================
// Telemetry (POST)
// ==============================
document.getElementById("btnGenPlot").addEventListener("click", () => {
  const id = crypto.randomUUID();
  document.getElementById("plotId").value = id;
  if (!document.getElementById("filterPlotId").value) {
    document.getElementById("filterPlotId").value = id;
  }
});

document.getElementById("btnSend").addEventListener("click", async () => {
  const sendMsg = document.getElementById("sendMsg");
  sendMsg.textContent = "";

  const plotId = document.getElementById("plotId").value.trim() || crypto.randomUUID();
  const soilMoisture = Number(document.getElementById("soilMoisture").value);
  const temperatureC = Number(document.getElementById("temperatureC").value);
  const precipitationMm = Number(document.getElementById("precipitationMm").value);

  const body = { plotId, timestamp: new Date().toISOString(), soilMoisture, temperatureC, precipitationMm };

  try {
    // /telemetry/telemetry/readings -> rewrite => /telemetry/readings
    const res = await fetch(apiUrl(cfg.TELEMETRY_BASE_URL, "/telemetry/readings"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });

    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    sendMsg.className = "small mt-2 text-success";
    sendMsg.textContent = "Leitura enviada! Id: " + (data.id || "(ok)");

    await loadAlerts();
    await loadHistory();
  } catch (e) {
    sendMsg.className = "small mt-2 text-danger";
    sendMsg.textContent = "Erro ao enviar leitura: " + e.message;
  }
});

// ==============================
// Status do Talhão
// ==============================
async function refreshPlotStatus(plotId) {
  const badge = document.getElementById("plotStatusBadge");
  if (!badge) return;

  badge.className = "badge text-bg-secondary";
  badge.textContent = "Carregando...";

  try {
    const url = new URL(apiUrl(cfg.ALERTS_BASE_URL, "/alerts"));
    url.searchParams.set("plotId", plotId);
    url.searchParams.set("ack", "false");

    const res = await fetch(url.toString(), { headers: { ...authHeaders() } });
    if (res.status === 401) return (window.location.href = "login.html");
    if (!res.ok) throw new Error(await res.text());

    const alerts = await res.json();
    const hasDrought = alerts.some(a => a.type === "LOW_MOISTURE");

    if (hasDrought) {
      badge.className = "badge text-bg-warning";
      badge.textContent = "Alerta de Seca";
      return;
    }

    badge.className = "badge text-bg-success";
    badge.textContent = "Normal";
  } catch (e) {
    badge.className = "badge text-bg-secondary";
    badge.textContent = "Indisponível";
    console.error(e);
  }
}

// ==============================
// Inicialização
// ==============================
window.addEventListener("DOMContentLoaded", async () => {
  await loadAlerts();
  await loadProperties();
  initModals();
});