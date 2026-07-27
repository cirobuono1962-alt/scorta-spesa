// ============================================================
// SCORTA — logica applicazione
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, doc, setDoc, addDoc,
  deleteDoc, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const cfg = window.__FIREBASE_CONFIG__;
const isConfigured = cfg && cfg.apiKey && !cfg.apiKey.startsWith("INSERISCI");

const viewEl = document.getElementById("view");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");
const setupBanner = document.getElementById("setup-banner");
const headerSub = document.getElementById("header-sub");

let db, auth;
let state = {
  tab: "prodotti",
  products: [],
  prices: [],
  ready: false,
  search: "",
  cart: loadCart(), // { [productId]: qty }
  lastQty: {},
};

// ---------- avvio ----------
if (!isConfigured) {
  setupBanner.innerHTML = `
    <div class="setup-banner">
      <strong>⚠️ Configurazione Firebase mancante</strong>
      Apri <span class="barcode-badge">index.html</span> e inserisci le chiavi del tuo progetto Firebase
      nel blocco <span class="barcode-badge">window.__FIREBASE_CONFIG__</span> in fondo al file
      (le trovi su console.firebase.google.com → Impostazioni progetto → Le tue app).
      Ricordati anche di attivare <span class="barcode-badge">Firestore Database</span> e
      <span class="barcode-badge">Authentication → Anonima</span>.
    </div>`;
  render();
} else {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  auth = getAuth(app);
  onAuthStateChanged(auth, (user) => {
    if (user) startListeners();
    else signInAnonymously(auth).catch((e) => {
      setupBanner.innerHTML = `<div class="setup-banner"><strong>Errore autenticazione</strong>${e.message}</div>`;
    });
  });
}

function startListeners() {
  onSnapshot(collection(db, "prodotti"), (snap) => {
    state.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.ready = true;
    render();
  });
  onSnapshot(collection(db, "prezzi"), (snap) => {
    state.prices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}

// ---------- utils ----------
function slug(s) {
  return (s || "").toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function eur(n) {
  return (n === undefined || n === null || isNaN(n)) ? "—" :
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem("scorta_cart") || "{}"); }
  catch { return {}; }
}
function saveCart() { localStorage.setItem("scorta_cart", JSON.stringify(state.cart)); }
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  toastRoot.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function pricesFor(productId) {
  return state.prices.filter(p => p.prodottoId === productId).sort((a, b) => a.prezzo - b.prezzo);
}
function bestPrice(productId) {
  const list = pricesFor(productId);
  return list.length ? list[0] : null;
}
function allSupermarkets() {
  return [...new Set(state.prices.map(p => p.supermercato))].sort();
}

// ---------- Open Food Facts: precompila i dati del prodotto dal codice a barre ----------
async function lookupOpenFoodFacts(barcode) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_it,generic_name,generic_name_it,brands,categories,quantity,image_front_small_url,image_small_url`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const pr = data.product;

    const nomeBase = pr.product_name_it || pr.product_name || pr.generic_name_it || pr.generic_name || "";
    const nome = [nomeBase, pr.brands ? `(${pr.brands.split(",")[0].trim()})` : ""].filter(Boolean).join(" ").trim();
    const descrizione = pr.generic_name_it || pr.generic_name || "";
    const categoria = pr.categories ? pr.categories.split(",").pop().trim() : "";
    const immagine = pr.image_front_small_url || pr.image_small_url || null;

    let unita = "pz";
    const q = (pr.quantity || "").toLowerCase();
    if (/kg\b/.test(q)) unita = "kg";
    else if (/\bg\b/.test(q)) unita = "g";
    else if (/\bl\b|litro/.test(q)) unita = "lt";
    else if (/ml\b/.test(q)) unita = "ml";

    if (!nome) return null;
    return { nome, descrizione, categoria, unita, barcode, immagine };
  } catch {
    return null;
  }
}

// ---------- tab nav ----------
const searchBarWrap = document.getElementById("search-bar-wrap");
const searchBoxEl = document.getElementById("search-box");

document.querySelectorAll("nav.tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    render();
  });
});
document.getElementById("fab-add").addEventListener("click", () => openProductModal());

searchBoxEl.addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});

// ============================================================
// RENDER
// ============================================================
function render() {
  headerSub.textContent = state.tab === "prodotti" ? `${state.products.length} prodotti in archivio`
    : state.tab === "confronto" ? "confronta i prezzi tra supermercati"
    : `${Object.values(state.cart).filter(q => q > 0).length} articoli in lista`;

  searchBarWrap.style.display = state.tab === "prodotti" ? "" : "none";

  if (!isConfigured) { viewEl.innerHTML = ""; return; }
  if (!state.ready) { viewEl.innerHTML = `<div class="empty">Carico l'archivio…</div>`; return; }

  if (state.tab === "prodotti") renderProdotti();
  else if (state.tab === "confronto") renderConfronto();
  else renderSpesa();
}

function renderProdotti() {
  const q = state.search.trim().toLowerCase();
  const list = state.products
    .filter(p => !q || p.nome.toLowerCase().includes(q) || (p.categoria || "").toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  viewEl.innerHTML = `
    <div class="card" style="padding:6px 14px;">
      ${list.length ? list.map(p => productRow(p)).join("") :
        `<div class="empty"><span class="ico">🗒️</span>Nessun prodotto${q ? " trovato" : ", aggiungine uno con il tasto +"}</div>`}
    </div>
  `;
  list.forEach(p => {
    document.getElementById("row-" + p.id).addEventListener("click", () => openProductDetail(p.id));
  });
}

function productRow(p) {
  const best = bestPrice(p.id);
  return `
    <div class="product-item" id="row-${p.id}">
      ${p.immagine
        ? `<img src="${escapeHtml(p.immagine)}" alt="" style="width:44px;height:44px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;flex-shrink:0;">`
        : `<div style="width:44px;height:44px;border-radius:8px;background:var(--paper);border:1px solid var(--line);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;">📦</div>`}
      <div class="info">
        <div class="name">${escapeHtml(p.nome)}</div>
        <div class="meta">${escapeHtml(p.categoria || "senza categoria")} · ${escapeHtml(p.unita || "pz")}${p.barcode ? ` · <span class="barcode-badge">${escapeHtml(p.barcode)}</span>` : ""}</div>
        ${best ? `<div class="best">✓ ${eur(best.prezzo)} da ${escapeHtml(best.supermercato)}</div>` : `<div class="meta">nessun prezzo registrato</div>`}
      </div>
      <div class="chev">›</div>
    </div>`;
}

function renderConfronto() {
  const markets = allSupermarkets();
  if (!state.products.length) {
    viewEl.innerHTML = `<div class="card"><div class="empty"><span class="ico">📊</span>Aggiungi prodotti e prezzi per vedere il confronto</div></div>`;
    return;
  }
  if (!markets.length) {
    viewEl.innerHTML = `<div class="card"><div class="empty"><span class="ico">📊</span>Nessun prezzo registrato ancora. Apri un prodotto per aggiungerne uno.</div></div>`;
    return;
  }
  const rows = [...state.products].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
    const pr = pricesFor(p.id);
    const min = pr.length ? Math.min(...pr.map(x => x.prezzo)) : null;
    const cells = markets.map(m => {
      const hit = pr.find(x => x.supermercato === m);
      const isBest = hit && hit.prezzo === min;
      return `<td class="price${isBest ? " best" : ""}">${hit ? eur(hit.prezzo) : "–"}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(p.nome)}</td>${cells}</tr>`;
  }).join("");

  viewEl.innerHTML = `
    <div class="card" style="overflow-x:auto;">
      <div class="section-title">Confronto prezzi</div>
      <table class="compare">
        <thead><tr><th>Prodotto</th>${markets.map(m => `<th>${escapeHtml(m)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSpesa() {
  const list = [...state.products].sort((a, b) => a.nome.localeCompare(b.nome));
  const checkedIds = Object.keys(state.cart).filter(id => state.cart[id] > 0);

  // calcolo assegnazione ottimale per supermercato
  const perMarket = {}; // { market: { items:[], totale } }
  const senzaPrezzo = [];
  checkedIds.forEach(id => {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const qty = state.cart[id];
    const best = bestPrice(id);
    if (!best) { senzaPrezzo.push(p); return; }
    if (!perMarket[best.supermercato]) perMarket[best.supermercato] = { items: [], totale: 0 };
    perMarket[best.supermercato].items.push({ nome: p.nome, unita: p.unita, qty, prezzo: best.prezzo });
    perMarket[best.supermercato].totale += best.prezzo * qty;
  });
  const grandTotal = Object.values(perMarket).reduce((s, m) => s + m.totale, 0);

  viewEl.innerHTML = `
    <div class="card" style="padding:6px 14px;">
      ${list.length ? list.map(p => spesaRow(p)).join("") : `<div class="empty">Nessun prodotto in archivio</div>`}
    </div>

    <div class="card">
      <div class="section-title">Riepilogo <span>${checkedIds.length} articoli</span></div>
      ${checkedIds.length === 0 ? `<div class="empty" style="padding:10px 0;">Seleziona i prodotti da comprare con la casella a fianco</div>` :
        Object.keys(perMarket).sort().map(m => `
          <div class="summary-line"><span>🏬 ${escapeHtml(m)} — ${perMarket[m].items.length} articoli</span><span class="v">${eur(perMarket[m].totale)}</span></div>
        `).join("") +
        (senzaPrezzo.length ? `<div class="summary-line"><span>⚠️ Senza prezzo</span><span class="v">${senzaPrezzo.length} articoli</span></div>` : "") +
        `<div class="summary-line total"><span>Totale spesa</span><span class="v">${eur(grandTotal)}</span></div>`
      }
      <div class="row-actions">
        <button class="btn btn-stamp btn-block" id="btn-pdf" ${checkedIds.length === 0 ? "disabled" : ""}>🖨️ Stampa / Salva PDF per supermercato</button>
      </div>
      ${checkedIds.length ? `<div class="row-actions"><button class="btn btn-ghost btn-block" id="btn-clear">Svuota lista</button></div>` : ""}
    </div>
  `;

  list.forEach(p => {
    const chk = document.getElementById("chk-" + p.id);
    const qtyInput = document.getElementById("qty-" + p.id);
    chk.addEventListener("click", () => {
      const isOn = state.cart[p.id] > 0;
      if (isOn) {
        state.lastQty[p.id] = state.cart[p.id];
        delete state.cart[p.id];
      } else {
        state.cart[p.id] = state.lastQty[p.id] || 1;
      }
      saveCart(); render();
    });
    if (qtyInput) {
      qtyInput.addEventListener("input", (e) => {
        const v = Math.max(1, parseInt(e.target.value) || 1);
        state.cart[p.id] = v;
        saveCart();
      });
      qtyInput.addEventListener("change", render);
    }
  });

  const pdfBtn = document.getElementById("btn-pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => generatePdf(perMarket, senzaPrezzo, grandTotal));
  const clearBtn = document.getElementById("btn-clear");
  if (clearBtn) clearBtn.addEventListener("click", () => { state.cart = {}; saveCart(); render(); });
}

function spesaRow(p) {
  const checked = state.cart[p.id] > 0;
  const qty = state.cart[p.id] || 1;
  const best = bestPrice(p.id);
  return `
    <div class="product-item">
      <div class="checkbox${checked ? " checked" : ""}" id="chk-${p.id}">${checked ? "✓" : ""}</div>
      <div class="info">
        <div class="name">${escapeHtml(p.nome)}</div>
        <div class="meta">${best ? `${eur(best.prezzo)} · ${escapeHtml(best.supermercato)}` : "nessun prezzo"}</div>
      </div>
      ${checked ? `<input type="number" min="1" class="qty-input" id="qty-${p.id}" value="${qty}">` : ""}
    </div>`;
}

// ============================================================
// PDF
// ============================================================
function generatePdf(perMarket, senzaPrezzo, grandTotal) {
  const markets = Object.keys(perMarket).sort();
  if (markets.length === 0) { toast("Nessun articolo con prezzo da mettere in lista"); return; }

  const dateStr = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  let html = "";
  markets.forEach((m, idx) => {
    const rows = perMarket[m].items.map(item => `
      <tr>
        <td>${escapeHtml(item.nome)}</td>
        <td class="num" style="text-align:right;">${item.qty} ${escapeHtml(item.unita || "")}</td>
        <td class="num" style="text-align:right;">${eur(item.prezzo)}</td>
        <td class="num" style="text-align:right;">${eur(item.prezzo * item.qty)}</td>
      </tr>`).join("");

    html += `
      <section class="print-page">
        <div class="print-kicker">SCORTA — LISTA DELLA SPESA · ${dateStr}</div>
        <h1 class="print-market">${escapeHtml(m)}</h1>
        <hr>
        <table class="print-table">
          <thead><tr><th>Prodotto</th><th style="text-align:right;">Qtà</th><th style="text-align:right;">Prezzo</th><th style="text-align:right;">Subtot.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="print-total">TOTALE&nbsp; ${eur(perMarket[m].totale)}</div>
      </section>`;
  });

  if (senzaPrezzo.length) {
    html += `
      <section class="print-page">
        <div class="print-kicker">SCORTA — LISTA DELLA SPESA · ${dateStr}</div>
        <h1 class="print-market">Senza prezzo registrato</h1>
        <hr>
        <ul class="print-list">${senzaPrezzo.map(p => `<li>${escapeHtml(p.nome)}</li>`).join("")}</ul>
      </section>`;
  }

  const printArea = document.getElementById("print-area");
  printArea.innerHTML = html;
  document.body.classList.add("printing");
  window.print();
  // ripristina la normale visualizzazione dopo la stampa/anteprima
  const cleanup = () => { document.body.classList.remove("printing"); printArea.innerHTML = ""; };
  if (window.matchMedia) {
    const mq = window.matchMedia("print");
    const handler = (e) => { if (!e.matches) { cleanup(); mq.removeEventListener?.("change", handler); } };
    mq.addEventListener?.("change", handler);
  }
  window.addEventListener("afterprint", cleanup, { once: true });
  toast("Scegli \"Salva come PDF\" per condividerlo su WhatsApp, oppure stampalo");
}

// ============================================================
// MODALI
// ============================================================
function closeModal() { modalRoot.innerHTML = ""; }

function openProductModal(prefill = {}) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="backdrop">
      <div class="modal modal-wrap">
        <button class="close" id="close-x">✕</button>
        <h3>${prefill.fromScan ? "Prodotto trovato — controlla e salva" : "Nuovo prodotto"}</h3>
        ${prefill.fromScan ? `<p style="font-size:12px;color:var(--grocer);margin-top:2px;font-weight:600;">✓ Dati precompilati da Open Food Facts — correggi se serve</p>` : ""}
        ${prefill.immagine ? `<img src="${escapeHtml(prefill.immagine)}" alt="" style="width:72px;height:72px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;margin:6px 0 4px;">` : ""}
        <label class="field">Nome</label>
        <input type="text" id="f-nome" value="${escapeHtml(prefill.nome || "")}" placeholder="es. Pasta De Cecco 500g">
        <label class="field">Descrizione (opzionale)</label>
        <input type="text" id="f-descrizione" value="${escapeHtml(prefill.descrizione || "")}" placeholder="es. Pasta di semola di grano duro">
        <label class="field">Codice a barre (opzionale)</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="f-barcode" value="${escapeHtml(prefill.barcode || "")}" placeholder="scansiona o scrivi">
          <button class="btn btn-ghost btn-sm" id="btn-scan-inline">📷</button>
        </div>
        <label class="field">Categoria</label>
        <input type="text" id="f-categoria" value="${escapeHtml(prefill.categoria || "")}" placeholder="es. Dispensa, Freschi, Casa…">
        <label class="field">Unità di misura</label>
        <select id="f-unita">
          ${["pz", "kg", "g", "lt", "ml"].map(u => `<option value="${u}" ${prefill.unita === u ? "selected" : ""}>${u}</option>`).join("")}
        </select>
        <div class="row-actions">
          <button class="btn btn-primary btn-block" id="btn-save-product">${prefill.fromScan ? "Salva e aggiungi prezzo →" : "Salva prodotto"}</button>
        </div>
      </div>
    </div>`;
  document.getElementById("close-x").addEventListener("click", closeModal);
  document.getElementById("backdrop").addEventListener("click", (e) => { if (e.target.id === "backdrop") closeModal(); });
  document.getElementById("btn-scan-inline").addEventListener("click", () => openScanner());
  document.getElementById("btn-save-product").addEventListener("click", async () => {
    const nome = document.getElementById("f-nome").value.trim();
    if (!nome) { toast("Inserisci il nome del prodotto"); return; }
    const data = {
      nome,
      descrizione: document.getElementById("f-descrizione").value.trim() || null,
      barcode: document.getElementById("f-barcode").value.trim() || null,
      categoria: document.getElementById("f-categoria").value.trim() || null,
      unita: document.getElementById("f-unita").value,
      immagine: prefill.immagine || null,
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "prodotti"), data);
    closeModal();
    if (prefill.fromScan) {
      toast("Prodotto salvato — aggiungi il prezzo");
      openProductDetail(ref.id);
    } else {
      toast("Prodotto aggiunto ✓");
    }
  });
}

function openScanner() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="backdrop-scan">
      <div class="modal modal-wrap">
        <button class="close" id="close-scan">✕</button>
        <h3>Scansiona codice a barre</h3>
        <p style="font-size:12px;color:var(--ink-soft);margin:2px 0 6px;text-align:center;">
          Inquadra il codice orizzontale, a 10-15 cm, con buona luce
        </p>
        <div id="reader" style="margin-top:4px;"></div>
        <div id="scan-status" style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">Avvio fotocamera…</div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);">
          <label class="field">Non riesce a leggerlo? Scrivilo qui — funziona sempre</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="manual-barcode" placeholder="Codice a barre" inputmode="numeric">
            <button class="btn btn-primary btn-sm" id="btn-manual-barcode">Usa</button>
          </div>
        </div>
      </div>
    </div>`;
  let scanner;
  let handled = false; // evita che letture multiple e rapidissime (Android) si sovrappongano
  const stop = () => { if (scanner) scanner.stop().catch(() => {}); };
  const handleCode = async (decodedText) => {
    if (handled) return; // scansione già in corso di gestione: ignora eventuali letture doppie
    handled = true;
    stop();
    const existing = state.products.find(p => p.barcode === decodedText);
    if (existing) {
      closeModal();
      openProductDetail(existing.id);
      toast("Prodotto trovato in archivio");
      return;
    }
    const st = document.getElementById("scan-status");
    if (st) st.textContent = "Cerco il prodotto…";
    const found = await lookupOpenFoodFacts(decodedText);
    closeModal();
    if (found) {
      openProductModal({ ...found, fromScan: true });
    } else {
      openProductModal({ barcode: decodedText, fromScan: true });
      toast("Prodotto non trovato online — inserisci i dati a mano");
    }
  };

  // Il tasto Usa e la X funzionano SEMPRE, indipendentemente dallo stato della scansione dal vivo.
  document.getElementById("close-scan").addEventListener("click", () => { stop(); closeModal(); });
  document.getElementById("backdrop-scan").addEventListener("click", (e) => {
    if (e.target.id === "backdrop-scan") { stop(); closeModal(); }
  });
  document.getElementById("btn-manual-barcode").addEventListener("click", () => {
    const v = document.getElementById("manual-barcode").value.trim();
    if (!v) { toast("Scrivi un codice"); return; }
    handled = false; // un inserimento manuale può sempre procedere, anche dopo un tentativo fallito
    handleCode(v);
  });
  document.getElementById("manual-barcode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-manual-barcode").click();
  });

  scanner = new Html5Qrcode("reader", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.ITF,
    ],
    verbose: false,
  });

  scanner.start(
    { facingMode: "environment" },
    {
      fps: 12,
      // riquadro largo e basso: molto più adatto ai codici a barre lineari di un quadrato
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.floor(viewfinderWidth * 0.9);
        const h = Math.floor(w * 0.38);
        return { width: w, height: Math.max(h, 90) };
      },
      aspectRatio: 1.4,
      disableFlip: false,
      // usa il rilevatore nativo del telefono quando disponibile (Android): molto più affidabile
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    },
    (decodedText) => handleCode(decodedText),
    () => { /* tentativo fallito su un singolo frame, normale: si riprova sul prossimo */ }
  ).then(() => {
    const st = document.getElementById("scan-status");
    if (st) st.textContent = "Inquadra il codice a barre…";
  }).catch((e) => {
    const st = document.getElementById("scan-status");
    if (st) st.textContent = "";
    const readerEl = modalRoot.querySelector("#reader");
    if (readerEl) {
      readerEl.innerHTML =
        `<div class="empty">Fotocamera non disponibile su questo dispositivo.<br>Scrivi il codice qui sotto.</div>`;
    }
  });
}

function openProductDetail(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  const prices = pricesFor(id);

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="backdrop-d">
      <div class="modal modal-wrap">
        <button class="close" id="close-d">✕</button>
        ${p.immagine ? `<img src="${escapeHtml(p.immagine)}" alt="" style="width:64px;height:64px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;margin-bottom:6px;">` : ""}
        <h3>${escapeHtml(p.nome)}</h3>
        <div class="meta" style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink-soft);margin-bottom:10px;">
          ${escapeHtml(p.categoria || "senza categoria")} · ${escapeHtml(p.unita || "pz")}
          ${p.barcode ? ` · <span class="barcode-badge">${escapeHtml(p.barcode)}</span>` : ""}
        </div>
        ${p.descrizione ? `<div style="font-size:13px;color:var(--ink-soft);margin:-4px 0 12px;">${escapeHtml(p.descrizione)}</div>` : ""}

        <div class="section-title">Prezzi registrati</div>
        <div id="price-list">
          ${prices.length ? prices.map(pr => `
            <div class="price-row">
              <span class="sup">🏬 ${escapeHtml(pr.supermercato)}</span>
              <span class="p">${eur(pr.prezzo)}</span>
              <button data-edit="${pr.id}" style="color:var(--grocer);">modifica</button>
              <button data-del="${pr.id}">elimina</button>
            </div>`).join("") : `<div class="empty" style="padding:10px 0;">Nessun prezzo ancora</div>`}
        </div>

        <label class="field">Aggiungi / aggiorna prezzo</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="f-sup" placeholder="Supermercato" list="sup-list" style="flex:1.3;">
          <input type="number" id="f-prz" placeholder="€" step="0.01" min="0" style="flex:1;">
        </div>
        <datalist id="sup-list">${allSupermarkets().map(m => `<option value="${escapeHtml(m)}">`).join("")}</datalist>
        <div class="row-actions">
          <button class="btn btn-primary btn-block" id="btn-add-price">Salva prezzo</button>
        </div>

        <div class="row-actions">
          <button class="btn btn-ghost" id="btn-edit-product" style="flex:1;">✏️ Modifica</button>
          <button class="btn btn-ghost" id="btn-del-product" style="flex:1;color:var(--stamp);">🗑 Elimina prodotto</button>
        </div>
      </div>
    </div>`;

  document.getElementById("close-d").addEventListener("click", closeModal);
  document.getElementById("backdrop-d").addEventListener("click", (e) => { if (e.target.id === "backdrop-d") closeModal(); });

  modalRoot.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "prezzi", btn.dataset.del));
      toast("Prezzo eliminato");
      openProductDetail(id);
    });
  });

  modalRoot.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pr = prices.find(x => x.id === btn.dataset.edit);
      if (!pr) return;
      const supEl = document.getElementById("f-sup");
      const przEl = document.getElementById("f-prz");
      supEl.value = pr.supermercato;
      przEl.value = pr.prezzo;
      przEl.focus();
      przEl.select();
      przEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.getElementById("btn-add-price").addEventListener("click", async () => {
    const sup = document.getElementById("f-sup").value.trim();
    const prz = parseFloat(document.getElementById("f-prz").value);
    if (!sup || isNaN(prz) || prz < 0) { toast("Inserisci supermercato e prezzo validi"); return; }
    const priceId = `${id}__${slug(sup)}`;
    await setDoc(doc(db, "prezzi", priceId), {
      prodottoId: id, supermercato: sup, prezzo: prz, aggiornato: serverTimestamp()
    });
    toast("Prezzo salvato ✓");
    openProductDetail(id);
  });

  document.getElementById("btn-edit-product").addEventListener("click", () => {
    closeModal();
    openEditProduct(p);
  });
  document.getElementById("btn-del-product").addEventListener("click", async () => {
    if (!confirm(`Eliminare "${p.nome}" e tutti i suoi prezzi?`)) return;
    await deleteDoc(doc(db, "prodotti", id));
    for (const pr of prices) await deleteDoc(doc(db, "prezzi", pr.id));
    delete state.cart[id]; saveCart();
    closeModal();
    toast("Prodotto eliminato");
  });
}

function openEditProduct(p) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="backdrop-e">
      <div class="modal modal-wrap">
        <button class="close" id="close-e">✕</button>
        <h3>Modifica prodotto</h3>
        <label class="field">Nome</label>
        <input type="text" id="e-nome" value="${escapeHtml(p.nome)}">
        <label class="field">Descrizione</label>
        <input type="text" id="e-descrizione" value="${escapeHtml(p.descrizione || "")}">
        <label class="field">Codice a barre</label>
        <input type="text" id="e-barcode" value="${escapeHtml(p.barcode || "")}">
        <label class="field">Categoria</label>
        <input type="text" id="e-categoria" value="${escapeHtml(p.categoria || "")}">
        <label class="field">Unità di misura</label>
        <select id="e-unita">
          ${["pz", "kg", "g", "lt", "ml"].map(u => `<option value="${u}" ${p.unita === u ? "selected" : ""}>${u}</option>`).join("")}
        </select>
        <div class="row-actions">
          <button class="btn btn-primary btn-block" id="btn-save-edit">Salva modifiche</button>
        </div>
      </div>
    </div>`;
  document.getElementById("close-e").addEventListener("click", closeModal);
  document.getElementById("backdrop-e").addEventListener("click", (e) => { if (e.target.id === "backdrop-e") closeModal(); });
  document.getElementById("btn-save-edit").addEventListener("click", async () => {
    await updateDoc(doc(db, "prodotti", p.id), {
      nome: document.getElementById("e-nome").value.trim(),
      descrizione: document.getElementById("e-descrizione").value.trim() || null,
      barcode: document.getElementById("e-barcode").value.trim() || null,
      categoria: document.getElementById("e-categoria").value.trim() || null,
      unita: document.getElementById("e-unita").value,
    });
    closeModal();
    toast("Prodotto aggiornato ✓");
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// scorciatoia: pulsante + apre anche lo scanner se si tiene premuto? -> teniamo semplice, usiamo fab per aggiunta manuale
// aggiunta di uno scanner rapido dalla tab prodotti tramite lungo tocco sul fab
let pressTimer;
document.getElementById("fab-add").addEventListener("touchstart", () => {
  pressTimer = setTimeout(() => openScanner(), 500);
});
document.getElementById("fab-add").addEventListener("touchend", () => clearTimeout(pressTimer));

render();
