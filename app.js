/* =========================
   Reservas Barquilla - v1
   - Guarda reservas en LocalStorage
   - Guarda clientes por teléfono (autocompletar)
   - Filtra pendientes y permite imprimir pendientes
   ========================= */

const $ = (id) => document.getElementById(id);

const LS_KEYS = {
  reservations: "barquilla_reservations_v1",
  clients: "barquilla_clients_v1",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizePhone(phone) {
  return (phone || "")
    .trim()
    .replace(/[\s\-().]/g, "")
    .replace(/(?!^\+)[^\d]/g, "");
}

function formatPhoneNice(phone) {
  const p = (phone || "").trim();
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ");
}

function makeId() {
  return crypto?.randomUUID?.() ?? String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function compareByDateTime(a, b) {
  const da = `${a.date}T${a.time}`;
  const db = `${b.date}T${b.time}`;
  return da.localeCompare(db);
}

// Estado
let reservations = loadJSON(LS_KEYS.reservations, []);
let clients = loadJSON(LS_KEYS.clients, {});

// Elementos
const form = $("reserveForm");
const elDate = $("date");
const elTime = $("time");
const elGuests = $("guests");
const elPhone = $("phone");
const elName = $("name");
const elAdded = $("added");
const elStatus = $("status");

const elOnlyPending = $("onlyPending");
const elSearch = $("search");

const elTbody = $("tbody");
const elCounts = $("counts");

const btnReset = $("btnReset");
const btnPrintPending = $("btnPrintPending");
const btnClearAll = $("btnClearAll");

// Defaults útiles
(function setDefaults() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  elDate.value = `${yyyy}-${mm}-${dd}`;

  const mins = today.getMinutes();
  const rounded = Math.ceil(mins / 5) * 5;
  today.setMinutes(rounded, 0, 0);
  const hh = String(today.getHours()).padStart(2, "0");
  const mi = String(today.getMinutes()).padStart(2, "0");
  elTime.value = `${hh}:${mi}`;
})();

function setStatus(msg) {
  elStatus.textContent = msg || "";
}

function upsertClientFromForm() {
  const phoneNorm = normalizePhone(elPhone.value);
  if (!phoneNorm) return;

  clients[phoneNorm] = {
    name: (elName.value || "").trim(),
    phoneOriginal: (elPhone.value || "").trim(),
    lastSeen: new Date().toISOString(),
  };
  saveJSON(LS_KEYS.clients, clients);
}

function tryAutofillClient() {
  const phoneNorm = normalizePhone(elPhone.value);
  if (!phoneNorm) return;

  const c = clients[phoneNorm];
  if (c?.name && (!elName.value || elName.value.trim().length < 2)) {
    elName.value = c.name;
    setStatus("Cliente reconocido: nombre autocompletado.");
  }
}

function resetForm(keepDateTime = true) {
  const dateVal = elDate.value;
  const timeVal = elTime.value;
  form.reset();
  if (keepDateTime) {
    elDate.value = dateVal;
    elTime.value = timeVal;
  }
  setStatus("");
  elGuests.focus();
}

function validateForm() {
  const date = elDate.value;
  const time = elTime.value;
  const guests = Number(elGuests.value);
  const name = (elName.value || "").trim();
  const phone = normalizePhone(elPhone.value);

  if (!date) return "Falta el día.";
  if (!time) return "Falta la hora.";
  if (!Number.isFinite(guests) || guests < 1) return "Comensales debe ser 1 o más.";
  if (!name) return "Falta el nombre.";
  if (!phone) return "Falta el teléfono.";

  return null;
}

function addReservationFromForm() {
  const phoneNorm = normalizePhone(elPhone.value);
  const phoneNice = formatPhoneNice(phoneNorm);

  const r = {
    id: makeId(),
    date: elDate.value,
    time: elTime.value,
    guests: Number(elGuests.value),
    name: (elName.value || "").trim(),
    phone: phoneNice,
    phoneNorm,
    addedToOfibarman: !!elAdded.checked,
    createdAt: new Date().toISOString(),
  };

  reservations.push(r);
  reservations.sort(compareByDateTime);

  saveJSON(LS_KEYS.reservations, reservations);
  upsertClientFromForm();
}

function matchesSearch(r, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    (r.name || "").toLowerCase().includes(s) ||
    (r.phone || "").toLowerCase().includes(s)
  );
}

function getFilteredReservations() {
  const onlyPending = elOnlyPending.checked;
  const q = (elSearch.value || "").trim();

  return reservations
    .filter((r) => (onlyPending ? !r.addedToOfibarman : true))
    .filter((r) => matchesSearch(r, q));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const filtered = getFilteredReservations();
  const total = reservations.length;
  const pending = reservations.filter((r) => !r.addedToOfibarman).length;

  elCounts.textContent = `Total: ${total} | Pendientes Ofibarman: ${pending} | Mostrando: ${filtered.length}`;

  elTbody.innerHTML = filtered.map((r) => {
    const badge = r.addedToOfibarman
      ? `<span class="badge badge--ok">Añadida</span>`
      : `<span class="badge badge--no">Pendiente</span>`;

    return `
      <tr data-id="${r.id}">
        <td>${r.date}</td>
        <td>${r.time}</td>
        <td>${r.guests}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.phone)}</td>
        <td>${badge}</td>
        <td class="noPrint">
          <div class="actions">
            <button class="btn btn--ghost small" data-action="toggle">
              ${r.addedToOfibarman ? "Marcar pendiente" : "Marcar añadida"}
            </button>
            <button class="btn btn--danger small" data-action="delete">Borrar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function toggleAdded(id) {
  const idx = reservations.findIndex((r) => r.id === id);
  if (idx === -1) return;
  reservations[idx].addedToOfibarman = !reservations[idx].addedToOfibarman;
  saveJSON(LS_KEYS.reservations, reservations);
  render();
}

function deleteReservation(id) {
  reservations = reservations.filter((r) => r.id !== id);
  saveJSON(LS_KEYS.reservations, reservations);
  render();
}

function printPendingOnly() {
  const prevPending = elOnlyPending.checked;
  const prevSearch = elSearch.value;

  elOnlyPending.checked = true;
  elSearch.value = "";
  render();

  setTimeout(() => {
    window.print();
    elOnlyPending.checked = prevPending;
    elSearch.value = prevSearch;
    render();
  }, 100);
}

/* ============ Eventos ============ */
elPhone.addEventListener("input", () => { tryAutofillClient(); });
elPhone.addEventListener("blur", () => {
  const p = normalizePhone(elPhone.value);
  elPhone.value = formatPhoneNice(p);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const err = validateForm();
  if (err) { setStatus(err); return; }
  addReservationFromForm();
  render();
  setStatus("Reserva guardada.");
  resetForm(true);
});

btnReset.addEventListener("click", () => resetForm(true));

elOnlyPending.addEventListener("change", render);
elSearch.addEventListener("input", render);

$("table").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const tr = e.target.closest("tr[data-id]");
  const id = tr?.dataset?.id;
  if (!id) return;

  const action = btn.dataset.action;
  if (action === "toggle") toggleAdded(id);
  if (action === "delete") deleteReservation(id);
});

btnPrintPending.addEventListener("click", printPendingOnly);

btnClearAll.addEventListener("click", () => {
  const ok = confirm("¿Seguro que quieres borrar TODAS las reservas? (No se puede deshacer)");
  if (!ok) return;
  reservations = [];
  saveJSON(LS_KEYS.reservations, reservations);
  render();
  setStatus("Reservas borradas.");
});

// Fecha para impresión (si existe el elemento)
window.addEventListener("beforeprint", () => {
  const el = document.getElementById("printDate");
  if (!el) return;
  const now = new Date();
  const fecha = now.toLocaleDateString("es-ES");
  const hora = now.toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' });
  el.textContent = `Impreso el ${fecha} a las ${hora}`;
});

// Pintado inicial
render();