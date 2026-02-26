/* =========================
   Reservas Barquilla - Firestore Sync
   - Reservas y clientes compartidos entre dispositivos
   - Requiere Firebase Auth Anónimo + Firestore
   ========================= */

const $ = (id) => document.getElementById(id);

/* ========= 1) PEGA AQUÍ TU firebaseConfig ========= */
const firebaseConfig = {
  apiKey: "AIzaSyAckXRiVw9nPEhDETO6RzGC4jL75bssnPk",
  authDomain: "reservas-barquilla.firebaseapp.com",
  projectId: "reservas-barquilla",
  storageBucket: "reservas-barquilla.firebasestorage.app",
  messagingSenderId: "31920389630",
  appId: "1:31920389630:web:87a2e0cd47031812e754af"
};

/* ========= 2) INIT FIREBASE ========= */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ========= 3) REFERENCIAS ========= */
const COL_RES = db.collection("reservations");
const COL_CLI = db.collection("clients");

/* ========= 4) ESTADO ========= */
let reservations = [];           // Array de reservas (desde Firestore)
let clientsCache = {};           // { phoneNorm: { name, phoneOriginal } }

/* ========= 5) ELEMENTOS UI ========= */
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

/* ========= UTILIDADES ========= */
function setStatus(msg) { if (elStatus) elStatus.textContent = msg || ""; }

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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toStartAt(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return firebase.firestore.Timestamp.fromDate(d);
}

function matchesSearch(r, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (r.name || "").toLowerCase().includes(s) || (r.phone || "").toLowerCase().includes(s);
}

function getFilteredReservations() {
  const onlyPending = !!elOnlyPending?.checked;
  const q = (elSearch?.value || "").trim();

  return reservations
    .filter((r) => (onlyPending ? !r.addedToOfibarman : true))
    .filter((r) => matchesSearch(r, q));
}

/* ========= DEFAULTS ========= */
(function setDefaults() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (elDate) elDate.value = `${yyyy}-${mm}-${dd}`;

  const mins = now.getMinutes();
  const rounded = Math.ceil(mins / 5) * 5;
  now.setMinutes(rounded, 0, 0);
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  if (elTime) elTime.value = `${hh}:${mi}`;
})();

/* ========= RENDER ========= */
function render() {
  const filtered = getFilteredReservations();
  const total = reservations.length;
  const pending = reservations.filter((r) => !r.addedToOfibarman).length;

  if (elCounts) {
    elCounts.textContent = `Total: ${total} | Pendientes Ofibarman: ${pending} | Mostrando: ${filtered.length}`;
  }

  if (!elTbody) return;

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

/* ========= FIRESTORE ACCIONES ========= */
async function addReservationFromForm() {
  const phoneNorm = normalizePhone(elPhone.value);
  const phoneNice = formatPhoneNice(phoneNorm);

  const date = elDate.value;
  const time = elTime.value;

  const doc = {
    date,
    time,
    startAt: toStartAt(date, time),
    guests: Number(elGuests.value),
    name: (elName.value || "").trim(),
    phone: phoneNice,
    phoneNorm,
    addedToOfibarman: !!elAdded.checked,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await COL_RES.add(doc);

  // Guardamos/actualizamos cliente (compartido)
  await COL_CLI.doc(phoneNorm).set({
    name: doc.name,
    phoneOriginal: (elPhone.value || "").trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function toggleAdded(id) {
  const ref = COL_RES.doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const current = snap.data()?.addedToOfibarman;
  await ref.update({ addedToOfibarman: !current });
}

async function deleteReservation(id) {
  await COL_RES.doc(id).delete();
}

async function clearAllReservations() {
  // Borrado en lote (limitación 500/batch). Para uso normal vale.
  const qs = await COL_RES.get();
  const batch = db.batch();
  qs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/* ========= AUTOCOMPLETE CLIENTE ========= */
function tryAutofillClient() {
  const phoneNorm = normalizePhone(elPhone.value);
  if (!phoneNorm) return;

  const c = clientsCache[phoneNorm];
  if (c?.name && (!elName.value || elName.value.trim().length < 2)) {
    elName.value = c.name;
    setStatus("Cliente reconocido: nombre autocompletado.");
  }
}

/* ========= IMPRESIÓN ========= */
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

window.addEventListener("beforeprint", () => {
  const el = document.getElementById("printDate");
  if (!el) return;
  const now = new Date();
  const fecha = now.toLocaleDateString("es-ES");
  const hora = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  el.textContent = `Impreso el ${fecha} a las ${hora}`;
});

/* ========= EVENTOS UI ========= */
elPhone?.addEventListener("input", tryAutofillClient);
elPhone?.addEventListener("blur", () => {
  const p = normalizePhone(elPhone.value);
  elPhone.value = formatPhoneNice(p);
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const date = elDate.value;
  const time = elTime.value;
  const guests = Number(elGuests.value);
  const name = (elName.value || "").trim();
  const phone = normalizePhone(elPhone.value);

  if (!date) return setStatus("Falta el día.");
  if (!time) return setStatus("Falta la hora.");
  if (!Number.isFinite(guests) || guests < 1) return setStatus("Comensales debe ser 1 o más.");
  if (!name) return setStatus("Falta el nombre.");
  if (!phone) return setStatus("Falta el teléfono.");

  try {
    await addReservationFromForm();
    setStatus("Reserva guardada.");
    form.reset();
    // Mantener fecha/hora por comodidad
    elDate.value = date;
    elTime.value = time;
    elGuests.focus();
  } catch (err) {
    setStatus(`Error guardando: ${err?.message || err}`);
  }
});

btnReset?.addEventListener("click", () => {
  const dateVal = elDate.value;
  const timeVal = elTime.value;
  form.reset();
  elDate.value = dateVal;
  elTime.value = timeVal;
  setStatus("");
  elGuests.focus();
});

elOnlyPending?.addEventListener("change", render);
elSearch?.addEventListener("input", render);

document.getElementById("table")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = e.target.closest("tr[data-id]");
  const id = tr?.dataset?.id;
  if (!id) return;

  try {
    const action = btn.dataset.action;
    if (action === "toggle") await toggleAdded(id);
    if (action === "delete") await deleteReservation(id);
  } catch (err) {
    setStatus(`Error: ${err?.message || err}`);
  }
});

btnPrintPending?.addEventListener("click", printPendingOnly);

btnClearAll?.addEventListener("click", async () => {
  const ok = confirm("¿Seguro que quieres borrar TODAS las reservas? (No se puede deshacer)");
  if (!ok) return;

  try {
    await clearAllReservations();
    setStatus("Reservas borradas.");
  } catch (err) {
    setStatus(`Error al vaciar: ${err?.message || err}`);
  }
});

/* ========= 6) LOGIN ANÓNIMO + LISTENERS ========= */
async function boot() {
  try {
    await auth.signInAnonymously();
  } catch (err) {
    setStatus(`Auth error: ${err?.message || err}`);
    return;
  }

  // Cache de clientes (para autocompletar en todos los dispositivos)
  COL_CLI.onSnapshot((snap) => {
    const map = {};
    snap.forEach((d) => {
      map[d.id] = d.data();
    });
    clientsCache = map;
  });

  // Reservas en tiempo real, ordenadas por startAt
  COL_RES.orderBy("startAt", "asc").onSnapshot((snap) => {
    const arr = [];
    snap.forEach((d) => {
      const data = d.data();
      arr.push({ id: d.id, ...data });
    });
    reservations = arr;
    render();
  });

  setStatus("Conectado. Datos sincronizados.");
}
/* ========= BLOQUEO PIN ========= */

/* ========= BLOQUEO PIN (ARRANCA ANTES QUE FIREBASE) ========= */
const PIN_CORRECTO = "2468"; // <-- CAMBIA AQUÍ TU PIN

const PIN_KEY = "barquilla_pin_ok";

function pinElements() {
  return {
    lock: document.getElementById("pinLock"),
    input: document.getElementById("pinInput"),
    btn: document.getElementById("pinBtn"),
    err: document.getElementById("pinError"),
  };
}

function hidePinLock() {
  const { lock } = pinElements();
  if (lock) lock.style.display = "none";
}

function showPinLock() {
  const { lock } = pinElements();
  if (lock) lock.style.display = "flex";
}

function isPinOk() {
  return localStorage.getItem(PIN_KEY) === "1";
}

function setPinOk() {
  localStorage.setItem(PIN_KEY, "1");
}

function wirePin(onSuccess) {
  const { input, btn, err } = pinElements();
  if (!input || !btn) return;

  const tryEnter = () => {
    const value = (input.value || "").trim();
    if (value === PIN_CORRECTO) {
      setPinOk();
      hidePinLock();
      if (typeof onSuccess === "function") onSuccess();
    } else {
      if (err) err.textContent = "PIN incorrecto";
    }
  };

  btn.addEventListener("click", tryEnter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryEnter();
  });
}

/* Esta función decide si arranca la app (Firebase) o no */
function requirePinThenStart(startAppFn) {
  // Si ya está OK, arrancamos directamente
  if (isPinOk()) {
    hidePinLock();
    startAppFn();
    return;
  }

  // Si no, mostramos PIN y esperamos
  showPinLock();
  wirePin(startAppFn);
}
requirePinThenStart(boot);
