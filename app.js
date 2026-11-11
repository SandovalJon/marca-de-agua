// Marca de Agua · lógica 100% en el navegador
const APP_VERSION = "v1.2.0";
const $ = (sel) => document.querySelector(sel);

const state = { items: [], seq: 0, lbIndex: -1, lbWmUrl: null, lbOrigUrl: null };

const els = {
  fileInput: $("#file-input"),
  dropZone: $("#drop-zone"),
  text: $("#wm-text"),
  size: $("#wm-size"),
  sizeValue: $("#wm-size-value"),
  color: $("#wm-color"),
  colorHex: $("#wm-color-hex"),
  opacity: $("#wm-opacity"),
  opacityValue: $("#wm-opacity-value"),
  position: $("#wm-position"),
  style: $("#wm-style"),
  grid: $("#grid"),
  empty: $("#empty-state"),
  count: $("#count"),
  btnDownload: $("#btn-download"),
  btnClear: $("#btn-clear"),
  zipName: $("#zip-name"),
  status: $("#status"),
  lightbox: $("#lightbox"),
  lightboxImg: $("#lightbox-img"),
  lightboxName: $("#lightbox-name"),
  lightboxClose: $("#lightbox-close"),
  lightboxPrev: $("#lightbox-prev"),
  lightboxNext: $("#lightbox-next"),
  lightboxOrig: $("#lightbox-orig"),
  lightboxDl: $("#lightbox-dl"),
  lightboxCounter: $("#lightbox-counter"),
};

const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

// % del ancho de la imagen según el slider 1..10
const sizePct = () => 1.5 + Number(els.size.value) * 0.75;
const sizeLabel = () => {
  const v = Number(els.size.value);
  const pct = sizePct().toFixed(2) + "%";
  const palabra = v <= 2 ? "Pequeño" : v <= 4 ? "Mediano" : v <= 6 ? "Grande" : v <= 8 ? "Muy grande" : "Enorme";
  return `${palabra} (${pct})`;
};

const getSettings = () => ({
  text: els.text.value,
  size: Number(els.size.value),
  color: els.color.value,
  opacity: els.opacity ? Number(els.opacity.value) : 50,
  position: els.position ? els.position.value : "bottom-right",
  style: els.style ? els.style.value : "sombra",
});

// ---- Persistencia local ----
const SAVE_KEY = "marca-agua-settings-v1";
function saveSettings() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      text: els.text.value,
      size: els.size.value,
      color: els.color.value,
      opacity: els.opacity?.value,
      position: els.position?.value,
      style: els.style?.value,
      zipName: els.zipName.value,
    }));
  } catch { /* almacenamiento no disponible */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.text === "string") els.text.value = s.text;
    if (s.size) els.size.value = s.size;
    if (s.color) els.color.value = s.color;
    if (s.opacity && els.opacity) els.opacity.value = s.opacity;
    if (s.position && els.position) els.position.value = s.position;
    if (s.style && els.style) els.style.value = s.style;
    if (typeof s.zipName === "string" && s.zipName) els.zipName.value = s.zipName;
  } catch { /* ignora datos corruptos */ }
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function updateSummary() {
  els.count.textContent = state.items.length;
  const has = state.items.length > 0;
  els.btnDownload.disabled = !has;
  els.btnClear.disabled = !has;
  els.empty.style.display = has ? "none" : "block";
}

function outputInfo(file) {
  const name = file.name || "foto";
  const dot = name.lastIndexOf(".");
  const extRaw = dot > -1 ? name.slice(dot + 1).toLowerCase() : "";
  const base = dot > -1 ? name.slice(0, dot) : name;
  // GIF/BMP/TIFF y formatos sin soporte de canvas → PNG
  if (extRaw === "png") return { base, ext: "png", mime: "image/png" };
  if (extRaw === "webp") return { base, ext: "webp", mime: "image/webp" };
  if (extRaw === "jpg" || extRaw === "jpeg") return { base, ext: extRaw, mime: "image/jpeg" };
  return { base, ext: "png", mime: "image/png" };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer: ${file.name}`)); };
    img.src = url;
  });
}

// Dibuja la imagen y el texto (opacidad y posición configurables)
function renderToCanvas(img, settings, maxDim) {
  const scale = maxDim ? Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const text = settings.text.trim();
  if (text) {
    const pct = 1.5 + settings.size * 0.75;
    const fontSize = Math.max(11, Math.round(w * pct / 100));
    const pad = Math.max(6, Math.round(w * 0.025));
    ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    ctx.textBaseline = "alphabetic";
    const tw = ctx.measureText(text).width;
    const pos = settings.position || "bottom-right";
    let x = w - pad - tw;
    let y = h - pad;
    if (pos.includes("left")) x = pad;
    else if (pos.includes("center")) x = Math.max(pad, (w - tw) / 2);
    else if (pos === "middle-right") x = Math.max(pad, w - pad - tw);
    // bottom-right / top-right usan el valor inicial (derecha)
    if (pos.startsWith("top")) y = pad + fontSize;
    else if (pos === "center" || pos.startsWith("middle")) y = h / 2 + fontSize / 2;
    else y = h - pad; // bottom-*
    x = Math.max(pad, Math.min(x, w - pad - tw));

    const alpha = Math.min(1, Math.max(0.1, (settings.opacity ?? 50) / 100));
    const style = settings.style || "sombra";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = settings.color;

    if (style === "fondo") {
      const bgPad = Math.round(fontSize * 0.25);
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = "#000000";
      ctx.fillRect(x - bgPad, y - fontSize - bgPad * 0.5, tw + bgPad * 2, fontSize + bgPad);
      ctx.restore();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = settings.color;
      ctx.fillText(text, x, y);
    } else if (style === "contorno") {
      ctx.lineWidth = Math.max(2, Math.round(fontSize / 12));
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    } else if (style === "ninguno") {
      ctx.fillText(text, x, y);
    } else { // sombra
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = Math.round(fontSize / 5);
      ctx.shadowOffsetY = Math.max(1, Math.round(fontSize / 18));
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  return canvas;
}

const canvasToBlob = (canvas, mime, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen."))), mime, quality);
  });

async function renderThumb(item) {
  try {
    const img = await loadImage(item.file);
    const canvas = renderToCanvas(img, getSettings(), 480);
    item.thumbUrl = canvas.toDataURL("image/jpeg", 0.8);
    const node = els.grid.querySelector(`[data-id="${item.id}"] img`);
    if (node) node.src = item.thumbUrl;
  } catch (e) {
    setStatus(e.message, true);
  }
}

function renderGrid() {
  els.grid.innerHTML = state.items.map(item => `
    <button class="thumb" data-id="${item.id}" title="Ver en grande: ${escapeHTML(item.file.name)}">
      <img src="${item.thumbUrl || ""}" alt="${escapeHTML(item.file.name)}">
      <span class="thumb-name">${escapeHTML(item.file.name)}</span>
      <span class="thumb-download" data-download="${item.id}" role="button" aria-label="Descargar ${escapeHTML(item.file.name)}" title="Descargar esta foto">⬇</span>
      <span class="thumb-remove" data-remove="${item.id}" role="button" aria-label="Quitar ${escapeHTML(item.file.name)}">✕</span>
    </button>`).join("");
  updateSummary();
}

async function downloadOne(item) {
  try {
    setStatus(`Procesando ${item.file.name}…`);
    const { base, ext, mime } = outputInfo(item.file);
    const img = await loadImage(item.file);
    const canvas = renderToCanvas(img, getSettings(), null);
    const blob = await canvasToBlob(canvas, mime, 0.92);
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${base}.${ext}` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Descargada: ${base}.${ext}`);
  } catch (err) {
    setStatus("Error al descargar: " + err.message, true);
  }
}

async function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith("image/"));
  if (!files.length) { setStatus("Solo se aceptan archivos de imagen.", true); return; }
  const seen = new Set(state.items.map(i => `${i.file.name}|${i.file.size}|${i.file.lastModified}`));
  const nuevos = [];
  let duplicados = 0;
  for (const file of files) {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) { duplicados++; continue; }
    seen.add(key);
    try {
      const img = await loadImage(file); // valida que se puede decodificar
      const item = { id: ++state.seq, file, width: img.naturalWidth, height: img.naturalHeight, thumbUrl: null };
      state.items.push(item);
      nuevos.push(item);
    } catch (e) {
      setStatus(e.message, true);
    }
  }
  renderGrid();
  for (const item of nuevos) await renderThumb(item);
  const msg = nuevos.length ? `${nuevos.length} foto(s) añadida(s).` : "";
  setStatus(duplicados ? `${msg} ${duplicados} duplicada(s) ignorada(s).` : msg);
}

function removeItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderGrid();
  if (!els.lightbox.hidden) {
    if (!state.items.length) closeLightbox();
    else showLightboxItem(Math.min(state.lbIndex, state.items.length - 1));
  }
}

function clearAll() {
  state.items = [];
  els.grid.innerHTML = "";
  setStatus("");
  if (!els.lightbox.hidden) closeLightbox();
  updateSummary();
}

// ---- Eventos ----
els.fileInput.addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });

["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) els.dropZone.classList.add("drag");
}));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  if (ev === "drop" || e.target === document || !document.contains(e.relatedTarget)) els.dropZone.classList.remove("drag");
}));
document.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

let debounceTimer = null;
function scheduleRefresh() {
  els.sizeValue.textContent = sizeLabel();
  els.colorHex.textContent = els.color.value;
  if (els.opacityValue) els.opacityValue.textContent = `${els.opacity.value}%`;
  saveSettings();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => state.items.forEach(renderThumb), 200);
}
els.size.addEventListener("input", scheduleRefresh);
els.color.addEventListener("input", scheduleRefresh);
els.text.addEventListener("input", scheduleRefresh);
if (els.opacity) els.opacity.addEventListener("input", scheduleRefresh);
if (els.position) els.position.addEventListener("change", scheduleRefresh);
if (els.style) els.style.addEventListener("change", scheduleRefresh);
if (els.zipName) els.zipName.addEventListener("input", saveSettings);
document.querySelectorAll(".preset").forEach(btn =>
  btn.addEventListener("click", () => { els.color.value = btn.dataset.color; scheduleRefresh(); }));

function closeLightbox() {
  els.lightbox.hidden = true;
  state.lbIndex = -1;
  if (state.lbOrigUrl) { URL.revokeObjectURL(state.lbOrigUrl); state.lbOrigUrl = null; }
  state.lbWmUrl = null;
}

async function showLightboxItem(idx) {
  if (!state.items.length) return;
  const n = state.items.length;
  state.lbIndex = ((idx % n) + n) % n;
  const item = state.items[state.lbIndex];
  try {
    if (state.lbOrigUrl) URL.revokeObjectURL(state.lbOrigUrl);
    state.lbOrigUrl = URL.createObjectURL(item.file);
    const img = await loadImage(item.file);
    const canvas = renderToCanvas(img, getSettings(), 1600);
    state.lbWmUrl = canvas.toDataURL("image/jpeg", 0.85);
    els.lightboxImg.src = state.lbWmUrl;
    els.lightboxName.textContent = `${item.file.name} · ${item.width}×${item.height}px`;
    if (els.lightboxCounter) els.lightboxCounter.textContent = `${state.lbIndex + 1}/${n}`;
    els.lightbox.hidden = false;
  } catch (err) {
    setStatus(err.message, true);
  }
}

function openLightboxById(id) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx > -1) showLightboxItem(idx);
}

els.grid.addEventListener("click", async e => {
  const dlBtn = e.target.closest("[data-download]");
  if (dlBtn) {
    e.stopPropagation();
    const item = state.items.find(i => i.id === Number(dlBtn.dataset.download));
    if (item) await downloadOne(item);
    return;
  }
  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) { e.stopPropagation(); removeItem(Number(removeBtn.dataset.remove)); return; }
  const thumb = e.target.closest(".thumb[data-id]");
  if (!thumb) return;
  openLightboxById(Number(thumb.dataset.id));
});

els.lightboxClose.addEventListener("click", closeLightbox);
els.lightbox.addEventListener("click", e => { if (e.target === els.lightbox) closeLightbox(); });
if (els.lightboxPrev) els.lightboxPrev.addEventListener("click", e => { e.stopPropagation(); showLightboxItem(state.lbIndex - 1); });
if (els.lightboxNext) els.lightboxNext.addEventListener("click", e => { e.stopPropagation(); showLightboxItem(state.lbIndex + 1); });
if (els.lightboxDl) els.lightboxDl.addEventListener("click", async e => {
  e.stopPropagation();
  const item = state.items[state.lbIndex];
  if (item) await downloadOne(item);
});
// Mantén pulsado para comparar original vs marca
if (els.lightboxOrig) {
  const showOrig = e => { e.preventDefault(); if (state.lbOrigUrl) els.lightboxImg.src = state.lbOrigUrl; };
  const showWm = () => { if (state.lbWmUrl) els.lightboxImg.src = state.lbWmUrl; };
  els.lightboxOrig.addEventListener("pointerdown", showOrig);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => els.lightboxOrig.addEventListener(ev, showWm));
}
document.addEventListener("keydown", e => {
  if (els.lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowRight") showLightboxItem(state.lbIndex + 1);
  else if (e.key === "ArrowLeft") showLightboxItem(state.lbIndex - 1);
});

els.btnClear.addEventListener("click", clearAll);

els.btnDownload.addEventListener("click", async () => {
  if (!state.items.length || typeof JSZip === "undefined") {
    setStatus("No se pudo cargar el compresor ZIP (vendor/jszip.min.js).", true);
    return;
  }
  els.btnDownload.disabled = true;
  const original = els.btnDownload.textContent;
  try {
    const zip = new JSZip();
    const usedNames = new Set();
    const uniqueName = (name) => {
      if (!usedNames.has(name.toLowerCase())) { usedNames.add(name.toLowerCase()); return name; }
      const dot = name.lastIndexOf(".");
      const stem = dot > -1 ? name.slice(0, dot) : name;
      const ext = dot > -1 ? name.slice(dot) : "";
      let n = 2;
      while (usedNames.has(`${stem} (${n})${ext}`.toLowerCase())) n++;
      const finalName = `${stem} (${n})${ext}`;
      usedNames.add(finalName.toLowerCase());
      return finalName;
    };

    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      els.btnDownload.textContent = `Procesando ${i + 1}/${state.items.length}…`;
      const { base, ext, mime } = outputInfo(item.file);
      const name = uniqueName(`${base}.${ext}`);
      const img = await loadImage(item.file);
      const canvas = renderToCanvas(img, getSettings(), null); // tamaño original
      const blob = await canvasToBlob(canvas, mime, 0.92);
      zip.file(name, blob);
    }

    els.btnDownload.textContent = "Comprimiendo…";
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    let zipName = (els.zipName.value || "fotos-con-marca-de-agua.zip").trim().replace(/[\\/:*?"<>|]/g, "_");
    if (!zipName.toLowerCase().endsWith(".zip")) zipName += ".zip";

    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: zipName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`ZIP descargado: ${zipName} (${state.items.length} fotos).`);
  } catch (err) {
    setStatus("Error al generar el ZIP: " + err.message, true);
  } finally {
    els.btnDownload.disabled = false;
    els.btnDownload.textContent = original;
  }
});

// Valores iniciales
loadSettings();
els.sizeValue.textContent = sizeLabel();
if (els.opacityValue && els.opacity) els.opacityValue.textContent = `${els.opacity.value}%`;
if (els.colorHex) els.colorHex.textContent = els.color.value;
const vEl = document.querySelector("#app-version");
if (vEl) vEl.textContent = APP_VERSION;
updateSummary();
