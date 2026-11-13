// Marca de Agua · lógica 100% en el navegador
const APP_VERSION = "v1.5.1";
const $ = (sel) => document.querySelector(sel);

const state = { items: [], seq: 0, lbIndex: -1, lbWmUrl: null, lbOrigUrl: null, cancelRequested: false, refreshGen: 0, logoImg: null, logoName: "" };

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
  btnUpdate: $("#btn-update"),
  quality: $("#wm-quality"),
  qualityValue: $("#wm-quality-value"),
  maxside: $("#wm-maxside"),
  btnApply: $("#btn-apply"),
  btnCancel: $("#btn-cancel"),
  progress: $("#progress"),
  progressBar: $("#progress-bar"),
  mode: $("#wm-mode"),
  logoInput: $("#wm-logo"),
  logoPreview: $("#wm-logo-preview"),
  logoClear: $("#btn-logo-clear"),
  logoScale: $("#wm-logo-scale"),
  logoScaleValue: $("#wm-logo-scale-value"),
  margin: $("#wm-margin"),
  marginValue: $("#wm-margin-value"),
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
  quality: els.quality ? Number(els.quality.value) : 92,
  maxside: els.maxside ? Number(els.maxside.value) : 0,
  mode: els.mode ? els.mode.value : "texto",
  logoScale: els.logoScale ? Number(els.logoScale.value) : 15,
  margin: els.margin ? Number(els.margin.value) : 1,
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
      quality: els.quality?.value,
      maxside: els.maxside?.value,
      mode: els.mode?.value,
      logoScale: els.logoScale?.value,
      margin: els.margin?.value,
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
    if (s.quality && els.quality) els.quality.value = s.quality;
    if (s.maxside != null && els.maxside) els.maxside.value = String(s.maxside);
    if (s.mode && els.mode) els.mode.value = s.mode;
    if (s.logoScale && els.logoScale) els.logoScale.value = s.logoScale;
    if (s.margin != null && els.margin) els.margin.value = s.margin;
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

function setProgress(done, total) {
  if (!els.progress || !els.progressBar) return;
  if (!total || done < 0) { els.progress.hidden = true; els.progressBar.style.width = "0%"; return; }
  els.progress.hidden = false;
  els.progressBar.style.width = `${Math.round(done / total * 100)}%`;
  if (done >= total) setTimeout(() => { if (els.progress) els.progress.hidden = true; }, 600);
}
function showCancel(show) {
  if (els.btnCancel) els.btnCancel.hidden = !show;
  if (show) state.cancelRequested = false;
}
// Cola con concurrencia limitada y soporte de cancelación
async function runParallel(list, limit, fn, onStep) {
  let idx = 0, done = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), list.length) }, async () => {
    while (true) {
      if (state.cancelRequested) return;
      const cur = idx++;
      if (cur >= list.length) return;
      await fn(list[cur], cur);
      done++;
      if (onStep) onStep(done, list.length);
    }
  });
  await Promise.all(workers);
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

// Dibuja la imagen y la marca (texto multilínea / logo / mosaico)
function renderToCanvas(img, settings, maxDim) {
  const scale = maxDim ? Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const mode = settings.mode || "texto";
  const alpha = Math.min(1, Math.max(0.1, (settings.opacity ?? 50) / 100));
  const marginF = Math.max(0, Number(settings.margin ?? 1));
  const pad = Math.max(2, Math.round(w * 0.025 * marginF));
  const pct = 1.5 + settings.size * 0.75;
  const fontSize = Math.max(11, Math.round(w * pct / 100));
  const lines = String(settings.text ?? "").split("\n").map(s => s.trimEnd()).filter((s, i, a) => s.trim() !== "" || a.length === 1).slice(0, 5);
  const hasText = lines.some(l => l.trim() !== "");
  const style = settings.style || "sombra";
  const pos = settings.position || "bottom-right";

  const paintTextLine = (line, x, y, tw) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = settings.color;
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (style === "fondo") {
      const bgPad = Math.round(fontSize * 0.25);
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = "#000000";
      ctx.fillRect(x - bgPad, y - fontSize - bgPad * 0.5, tw + bgPad * 2, fontSize + bgPad);
      ctx.restore();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = settings.color;
      ctx.fillText(line, x, y);
    } else if (style === "contorno") {
      ctx.lineWidth = Math.max(2, Math.round(fontSize / 12));
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    } else if (style === "ninguno") {
      ctx.fillText(line, x, y);
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = Math.round(fontSize / 5);
      ctx.shadowOffsetY = Math.max(1, Math.round(fontSize / 18));
      ctx.fillText(line, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  const drawTextBlock = () => {
    if (!hasText) return { w: 0, h: 0 };
    ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    ctx.textBaseline = "alphabetic";
    const lineH = Math.round(fontSize * 1.18);
    const widths = lines.map(l => ctx.measureText(l).width);
    const blockW = Math.max(...widths);
    const blockH = lineH * (lines.length - 1) + fontSize;
    let bx = w - pad - blockW;
    let by = h - pad; // baseline última línea
    if (pos.includes("left")) bx = pad;
    else if (pos.includes("center")) bx = Math.max(pad, (w - blockW) / 2);
    else if (pos === "middle-right") bx = Math.max(pad, w - pad - blockW);
    if (pos.startsWith("top")) by = pad + fontSize + lineH * (lines.length - 1);
    else if (pos === "center" || pos.startsWith("middle")) by = h / 2 + (lineH * (lines.length - 1)) / 2 + fontSize / 2 - 2;
    bx = Math.max(pad, Math.min(bx, w - pad - blockW));
    lines.forEach((line, i) => {
      const y = by - lineH * (lines.length - 1 - i);
      paintTextLine(line, bx, y, widths[i]);
    });
    return { w: blockW, h: blockH, x: bx, yTop: by - blockH };
  };

  const drawLogo = (offsetX = 0, offsetY = 0) => {
    if (!state.logoImg) return { w: 0, h: 0 };
    const targetW = Math.max(16, Math.round(w * (settings.logoScale || 15) / 100));
    const r = targetW / state.logoImg.naturalWidth;
    const lw = targetW;
    const lh = Math.max(8, Math.round(state.logoImg.naturalHeight * r));
    let lx = w - pad - lw + offsetX;
    let ly = h - pad - lh + offsetY;
    if (pos.includes("left")) lx = pad + offsetX;
    else if (pos.includes("center")) lx = Math.max(pad, (w - lw) / 2 + offsetX);
    if (pos.startsWith("top")) ly = pad + offsetY;
    else if (pos === "center" || pos.startsWith("middle")) ly = Math.round(h / 2 - lh / 2 + offsetY);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(state.logoImg, Math.round(lx), Math.round(ly), lw, lh);
    ctx.restore();
    ctx.globalAlpha = 1;
    return { w: lw, h: lh };
  };

  if (mode === "mosaico" && hasText) {
    ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = settings.color;
    ctx.globalAlpha = alpha;
    if (style === "sombra") { ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = Math.round(fontSize / 5); }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    const line = lines[0];
    const tw = ctx.measureText(line).width;
    const stepX = Math.max(80, tw + fontSize * 3);
    const stepY = Math.round(fontSize * 3.2);
    const diag = Math.ceil(Math.sqrt(w * w + h * h));
    for (let yy = -diag / 2; yy < diag / 2; yy += stepY) {
      for (let xx = -diag / 2; xx < diag / 2; xx += stepX) {
        ctx.fillText(line, xx, yy);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    return canvas;
  }

  if (mode === "logo") { drawLogo(); return canvas; }
  if (mode === "texto-logo") {
    const t = drawTextBlock();
    // Logo encima del texto (o debajo si el texto está arriba)
    const gap = 8;
    if (pos.startsWith("top")) drawLogo(0, (t.h || 0) + gap);
    else drawLogo(0, -((t.h || 0) + gap));
    if (!hasText) drawLogo();
    return canvas;
  }
  drawTextBlock();
  if (mode !== "texto" && hasText === false) drawLogo();
  return canvas;
}

const canvasToBlob = (canvas, mime, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen."))), mime, quality);
  });

async function renderThumb(item, gen) {
  try {
    const img = await loadImage(item.file);
    if (gen != null && gen !== state.refreshGen) return; // ajuste más nuevo ganó
    const canvas = renderToCanvas(img, getSettings(), 480);
    item.thumbUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (gen != null && gen !== state.refreshGen) return;
    const node = els.grid.querySelector(`[data-id="${item.id}"] img`);
    if (node) node.src = item.thumbUrl;
  } catch (e) {
    if (gen == null || gen === state.refreshGen) setStatus(e.message, true);
  }
}

async function refreshThumbs(items) {
  const gen = ++state.refreshGen;
  const list = items || state.items;
  if (!list.length) return;
  await runParallel(list, 4, (it) => renderThumb(it, gen));
}

function renderGrid() {
  els.grid.innerHTML = state.items.map(item => `
    <div class="thumb" data-id="${item.id}" role="button" tabindex="0" title="Ver en grande: ${escapeHTML(item.file.name)}" aria-label="Ver en grande: ${escapeHTML(item.file.name)}">
      <img src="${item.thumbUrl || ""}" alt="${escapeHTML(item.file.name)}">
      <span class="thumb-name">${escapeHTML(item.file.name)}</span>
      <button type="button" class="thumb-download" data-download="${item.id}" aria-label="Descargar ${escapeHTML(item.file.name)}" title="Descargar esta foto">⬇</button>
      <button type="button" class="thumb-remove" data-remove="${item.id}" aria-label="Quitar ${escapeHTML(item.file.name)}" title="Quitar foto">✕</button>
    </div>`).join("");
  updateSummary();
}

async function downloadOne(item) {
  try {
    setStatus(`Procesando ${item.file.name}…`);
    const { base, ext, mime } = outputInfo(item.file);
    const s = getSettings();
    const maxDim = s.maxside > 0 ? s.maxside : null;
    const q = Math.min(1, Math.max(0.6, (s.quality || 92) / 100));
    const img = await loadImage(item.file);
    const canvas = renderToCanvas(img, s, maxDim);
    const blob = await canvasToBlob(canvas, mime, q);
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
  const fresh = [];
  let duplicados = 0;
  for (const file of files) {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) { duplicados++; continue; }
    seen.add(key);
    fresh.push(file);
  }
  if (!fresh.length) { setStatus(duplicados ? `${duplicados} duplicada(s) ignorada(s).` : "", !!0); return; }
  showCancel(true);
  setProgress(0, fresh.length);
  setStatus(`Cargando 0/${fresh.length}…`);
  const nuevos = [];
  await runParallel(fresh, 4, async (file) => {
    try {
      const img = await loadImage(file); // valida que se puede decodificar
      const item = { id: ++state.seq, file, width: img.naturalWidth, height: img.naturalHeight, thumbUrl: null };
      state.items.push(item);
      nuevos.push(item);
    } catch (e) {
      setStatus(e.message, true);
    }
    setProgress(nuevos.length, fresh.length);
    if (!state.cancelRequested) setStatus(`Cargando ${Math.min(nuevos.length, fresh.length)}/${fresh.length}…`);
  });
  const cancelled = state.cancelRequested;
  showCancel(false);
  setProgress(-1);
  renderGrid();
  if (nuevos.length && !cancelled) {
    setStatus(`Generando vistas ${nuevos.length}…`);
    await refreshThumbs(nuevos);
  }
  const msg = nuevos.length ? `${nuevos.length} foto(s) añadida(s).` : "";
  const dup = duplicados ? ` ${duplicados} duplicada(s) ignorada(s).` : "";
  setStatus(cancelled ? `Cancelado. ${msg}${dup}` : `${msg}${dup}`);
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
  if (els.qualityValue && els.quality) els.qualityValue.textContent = `${els.quality.value}%`;
  saveSettings();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { refreshThumbs(); }, 400);
}
function scheduleSaveOnly() {
  if (els.qualityValue && els.quality) els.qualityValue.textContent = `${els.quality.value}%`;
  saveSettings();
}
els.size.addEventListener("input", scheduleRefresh);
els.color.addEventListener("input", scheduleRefresh);
els.text.addEventListener("input", scheduleRefresh);
if (els.opacity) els.opacity.addEventListener("input", scheduleRefresh);
if (els.position) els.position.addEventListener("change", scheduleRefresh);
if (els.style) els.style.addEventListener("change", scheduleRefresh);
if (els.quality) els.quality.addEventListener("input", scheduleSaveOnly);
if (els.maxside) els.maxside.addEventListener("change", saveSettings);
if (els.zipName) els.zipName.addEventListener("input", saveSettings);
if (els.mode) els.mode.addEventListener("change", scheduleRefresh);
if (els.logoScale) els.logoScale.addEventListener("input", () => {
  if (els.logoScaleValue) els.logoScaleValue.textContent = `${els.logoScale.value}%`;
  scheduleRefresh();
});
if (els.margin) els.margin.addEventListener("input", () => {
  if (els.marginValue) els.marginValue.textContent = `${Number(els.margin.value)}×`;
  scheduleRefresh();
});
if (els.logoInput) els.logoInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const img = await loadImage(f);
    state.logoImg = img;
    state.logoName = f.name;
    if (els.logoPreview) { els.logoPreview.src = URL.createObjectURL(f); els.logoPreview.hidden = false; }
    if (els.logoClear) els.logoClear.hidden = false;
    setStatus(`Logo cargado: ${f.name}`);
    scheduleRefresh();
  } catch (err) { setStatus(err.message, true); }
});
if (els.logoClear) els.logoClear.addEventListener("click", () => {
  state.logoImg = null; state.logoName = "";
  if (els.logoInput) els.logoInput.value = "";
  if (els.logoPreview) { els.logoPreview.removeAttribute("src"); els.logoPreview.hidden = true; }
  els.logoClear.hidden = true;
  scheduleRefresh();
});
document.querySelectorAll(".preset").forEach(btn =>
  btn.addEventListener("click", () => { els.color.value = btn.dataset.color; scheduleRefresh(); }));
if (els.btnApply) els.btnApply.addEventListener("click", () => { scheduleRefresh(); refreshThumbs(); setStatus("Vistas actualizadas."); });
if (els.btnCancel) els.btnCancel.addEventListener("click", () => { state.cancelRequested = true; setStatus("Cancelando…"); });

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

// Teclado: Enter/Espacio abre la vista grande (los botones internos ya son nativos).
els.grid.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const thumb = e.target.closest(".thumb[data-id]");
  if (!thumb || e.target.closest("button")) return;
  e.preventDefault();
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

if (els.btnUpdate) els.btnUpdate.addEventListener("click", async () => {
  const btn = els.btnUpdate;
  const original = btn.textContent;
  try {
    btn.textContent = "Actualizando…";
    btn.disabled = true;
    // Limpia Service Workers y cachés (GitHub Pages + navegador)
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all((regs || []).map(r => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
    }
    // Recarga sin caché: rompe query + reload forzado
    const url = new URL(location.href);
    url.searchParams.set("v", Date.now().toString());
    location.href = url.toString();
    setTimeout(() => location.reload(), 500);
  } catch {
    location.reload();
  } finally {
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  }
});

els.btnDownload.addEventListener("click", async () => {
  if (!state.items.length || typeof JSZip === "undefined") {
    setStatus("No se pudo cargar el compresor ZIP (vendor/jszip.min.js).", true);
    return;
  }
  els.btnDownload.disabled = true;
  const original = els.btnDownload.textContent;
  showCancel(true);
  setProgress(0, state.items.length);
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

    const settings = getSettings();
    const maxDim = settings.maxside > 0 ? settings.maxside : null;
    const q = Math.min(1, Math.max(0.6, (settings.quality || 92) / 100));
    for (let i = 0; i < state.items.length; i++) {
      if (state.cancelRequested) break;
      const item = state.items[i];
      els.btnDownload.textContent = `Procesando ${i + 1}/${state.items.length}…`;
      setProgress(i, state.items.length);
      const { base, ext, mime } = outputInfo(item.file);
      const name = uniqueName(`${base}.${ext}`);
      const img = await loadImage(item.file);
      const canvas = renderToCanvas(img, settings, maxDim);
      const blob = await canvasToBlob(canvas, mime, q);
      zip.file(name, blob);
      setProgress(i + 1, state.items.length);
    }
    if (state.cancelRequested) { setStatus("Descarga cancelada.", true); return; }

    els.btnDownload.textContent = "Comprimiendo…";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    if (state.cancelRequested) { setStatus("Descarga cancelada.", true); return; }
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
    showCancel(false);
    setProgress(-1);
    els.btnDownload.disabled = false;
    els.btnDownload.textContent = original;
  }
});

// Valores iniciales
loadSettings();
els.sizeValue.textContent = sizeLabel();
if (els.opacityValue && els.opacity) els.opacityValue.textContent = `${els.opacity.value}%`;
if (els.qualityValue && els.quality) els.qualityValue.textContent = `${els.quality.value}%`;
if (els.logoScaleValue && els.logoScale) els.logoScaleValue.textContent = `${els.logoScale.value}%`;
if (els.marginValue && els.margin) els.marginValue.textContent = `${Number(els.margin.value)}×`;
if (els.colorHex) els.colorHex.textContent = els.color.value;
const vEl = document.querySelector("#app-version");
if (vEl) vEl.textContent = APP_VERSION;
updateSummary();
