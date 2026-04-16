
(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  const sheetSelect = document.getElementById("sheetSelect");
  const tablebox = document.getElementById("tablebox");
  const previewEl = document.getElementById("preview");
  const downloadsEl = document.getElementById("downloads");
  const labelFormatEl = document.getElementById("labelFormat");

  let workbook = null;
  let rows = [];
  let headers = [];
  const logoCache = new Map();

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function clearDownloads() {
    downloadsEl.innerHTML = "";
  }

  function addDownloadCard(blob, filename) {
    const url = URL.createObjectURL(blob);
    const card = document.createElement("div");
    card.className = "download-card";

    const title = document.createElement("strong");
    title.textContent = filename;

    const dl = document.createElement("a");
    dl.href = url;
    dl.download = filename;
    dl.textContent = "Télécharger";

    const open = document.createElement("a");
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Ouvrir";

    card.appendChild(title);
    card.appendChild(dl);
    card.appendChild(open);
    downloadsEl.appendChild(card);

    return { url, dl };
  }

  function normalizeKey(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function guessColumn(cols, candidates) {
    const normalized = cols.map((c) => ({ raw: c, norm: normalizeKey(c) }));
    for (const candidate of candidates) {
      const cNorm = normalizeKey(candidate);
      const exact = normalized.find((c) => c.norm === cNorm);
      if (exact) return exact.raw;
    }
    for (const candidate of candidates) {
      const cNorm = normalizeKey(candidate);
      const partial = normalized.find((c) => c.norm.includes(cNorm) || cNorm.includes(c.norm));
      if (partial) return partial.raw;
    }
    return null;
  }

  function detectColumns(cols) {
    return {
      labelFormat: guessColumn(cols, ["Label Format", "Format"]),
      brand: guessColumn(cols, ["Brand", "Marque"]),
      sku: guessColumn(cols, ["SKU", "Référence", "Reference"]),
      product: guessColumn(cols, ["Product", "Produit"]),
      gencode: guessColumn(cols, ["Gencode - number", "Gencode", "EAN"]),
      desFR: guessColumn(cols, ["Designation FR", "Désignation FR"]),
      desEN: guessColumn(cols, ["Designation EN", "Désignation EN"]),
      desES: guessColumn(cols, ["Designation ES", "Désignation ES"]),
      desIT: guessColumn(cols, ["Designation IT", "Désignation IT"]),
      desPT: guessColumn(cols, ["Designation PT", "Désignation PT"]),
      designation: guessColumn(cols, ["Designation", "Désignation"]),
    };
  }

  function detectContentColumns(cols) {
    return {
      parentSku: guessColumn(cols, ["Parent SKU", "SKU parent"]),
      sku: guessColumn(cols, ["SKU"]),
      designation: guessColumn(cols, ["Designation", "Désignation"]),
      quantity: guessColumn(cols, ["Quantity", "Qty", "Quantité", "Quantite"]),
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (s) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[s]));
  }

  function renderTable(data) {
    if (!data.length) {
      tablebox.innerHTML = "<p class='muted' style='padding:12px;'>Aucune donnée.</p>";
      return;
    }
    const cols = Object.keys(data[0]);
    const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const body = data.slice(0, 20).map((row) =>
      `<tr>${cols.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`
    ).join("");
    tablebox.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function normalizeGencode(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return String(Math.round(value));
    const raw = String(value).trim();
    if (/^\d+(\.0+)?$/.test(raw)) return raw.split(".")[0];
    return raw.replace(/\s+/g, "");
  }

  function isValidEAN13(value) {
    const s = normalizeGencode(value).replace(/\D/g, "");
    if (s.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      const digit = parseInt(s[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(s[12], 10);
  }

  function barcodeFormatInfo(value) {
    const digits = normalizeGencode(value).replace(/\D/g, "");
    if (isValidEAN13(digits)) {
      return { format: "EAN13", value: digits, isEan: true };
    }
    return { format: "CODE128", value: normalizeGencode(value), isEan: false };
  }

  function makeBarcodeDataUrl(value, targetWidthMm = 64, targetHeightMm = 16, blackAndWhite = false) {
    if (!value && value !== 0) return null;
    const info = barcodeFormatInfo(value);
    const canvas = document.createElement("canvas");
    const pxPerMm = 12;
    const targetWidthPx = Math.max(700, Math.round(targetWidthMm * pxPerMm));
    const targetHeightPx = Math.max(220, Math.round(targetHeightMm * pxPerMm));

    try {
      JsBarcode(canvas, info.value, {
        format: info.format,
        displayValue: false,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
        width: info.isEan ? 3.0 : 2.2,
        height: targetHeightPx,
      });

      let finalCanvas = canvas;
      if (canvas.width < targetWidthPx) {
        const ratio = targetWidthPx / canvas.width;
        const big = document.createElement("canvas");
        big.width = Math.round(canvas.width * ratio);
        big.height = Math.round(canvas.height * ratio);
        const ctx = big.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, big.width, big.height);
        ctx.drawImage(canvas, 0, 0, big.width, big.height);
        finalCanvas = big;
      }

      if (blackAndWhite) {
        const bw = document.createElement("canvas");
        bw.width = finalCanvas.width;
        bw.height = finalCanvas.height;
        const ctx = bw.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, bw.width, bw.height);
        ctx.drawImage(finalCanvas, 0, 0);
        finalCanvas = bw;
      }

      return { url: finalCanvas.toDataURL("image/png"), isEan: info.isEan };
    } catch (err) {
      return null;
    }
  }

  function getDisplayOptions() {
    return {
      showSku: document.getElementById("showSku").checked,
      showDesignation: document.getElementById("showDesignation").checked,
      showGencode: document.getElementById("showGencode").checked,
      showBarcode: document.getElementById("showBarcode").checked,
      exportBW: document.getElementById("exportBW").checked,
    };
  }

  function getSelectedLanguages() {
    return [
      ["FR", document.getElementById("langFR").checked],
      ["EN", document.getElementById("langEN").checked],
      ["ES", document.getElementById("langES").checked],
      ["IT", document.getElementById("langIT").checked],
      ["PT", document.getElementById("langPT").checked],
    ].filter((x) => x[1]).map((x) => x[0]);
  }

  function getDesignationLines(row, detected) {
    const selected = getSelectedLanguages();
    const map = {
      FR: detected.desFR,
      EN: detected.desEN,
      ES: detected.desES,
      IT: detected.desIT,
      PT: detected.desPT,
    };

    const lines = [];
    selected.forEach((lang) => {
      const col = map[lang];
      if (col && row[col]) lines.push({ lang, text: String(row[col]) });
    });

    if (!lines.length && detected.desFR && row[detected.desFR]) {
      lines.push({ lang: "FR", text: String(row[detected.desFR]) });
    }
    if (!lines.length && detected.designation && row[detected.designation]) {
      lines.push({ lang: "", text: String(row[detected.designation]) });
    }
    return lines.slice(0, 2);
  }

  function getSmallTitleFontSize(lines) {
    const joined = lines.map((x) => x.text).join(" ');
    const len = joined.length;
    if (len <= 28) return 17;
    if (len <= 50) return 15;
    if (len <= 75) return 13;
    return 11;
  }

  function getBrandValue(row, detected) {
    if (!detected.brand) return "";
    return String(row[detected.brand] || "").trim();
  }

  function isNoName(brand) {
    const b = normalizeKey(brand);
    return !b || b === "no name" || b === "noname" || b === "no-name";
  }

  function brandAssetPath(brand) {
    return `assets/${encodeURIComponent(brand)}.png`;
  }

  function loadBrandLogo(brand) {
    return new Promise((resolve) => {
      if (isNoName(brand)) {
        resolve(null);
        return;
      }
      if (logoCache.has(brand)) {
        resolve(logoCache.get(brand));
        return;
      }
      const img = new Image();
      img.onload = () => {
        logoCache.set(brand, img);
        resolve(img);
      };
      img.onerror = () => {
        logoCache.set(brand, null);
        resolve(null);
      };
      img.src = brandAssetPath(brand);
    });
  }

  function getFormatPreset() {
    return labelFormatEl.value === "large"
      ? { key: "large", widthMm: 148, heightMm: 105 }
      : { key: "small", widthMm: 100, heightMm: 40 };
  }

  function preparedRows() {
    const detected = detectColumns(headers);
    const fmt = getFormatPreset();
    return rows.map((row) => ({ row, detected, fmt }));
  }

  function getContentSheetRows() {
    if (!workbook) return [];
    const preferred = workbook.SheetNames.find((name) =>
      ["contenu", "content", "kit content", "carton content", "feuil2"].includes(normalizeKey(name))
    );
    const candidate = preferred || workbook.SheetNames.find((name) => name !== sheetSelect.value);
    if (!candidate) return [];
    const sheet = workbook.Sheets[candidate];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  function getLinkedContentRows(productRow, detected) {
    const contentRows = getContentSheetRows();
    if (!contentRows.length || !detected.sku) return [];
    const skuValue = String(productRow[detected.sku] || "").trim();
    const contentCols = detectContentColumns(Object.keys(contentRows[0] || {}));
    if (!contentCols.parentSku) return [];
    return contentRows
      .filter((r) => String(r[contentCols.parentSku] || "").trim() === skuValue)
      .map((r) => ({
        sku: contentCols.sku ? String(r[contentCols.sku] || "") : "",
        designation: contentCols.designation ? String(r[contentCols.designation] || "") : "",
        quantity: contentCols.quantity ? String(r[contentCols.quantity] || "") : "",
      }));
  }

  function imageToDataUrl(img, blackAndWhite = false) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    if (blackAndWhite) {
      const data = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        data.data[i] = gray;
        data.data[i + 1] = gray;
        data.data[i + 2] = gray;
      }
      ctx.putImageData(data, 0, 0);
    }
    return c.toDataURL("image/png");
  }

  function drawImageContained(doc, imgDataUrl, x, y, boxW, boxH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(boxW / img.width, boxH / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        const dx = x + (boxW - drawW) / 2;
        const dy = y + (boxH - drawH) / 2;
        doc.addImage(imgDataUrl, "PNG", dx, dy, drawW, drawH, undefined, "FAST");
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imgDataUrl;
    });
  }

  async function previewFirst() {
    const items = preparedRows();
    if (!items.length) {
      setStatus("Charge d'abord un fichier Excel.");
      return;
    }

    const { row, detected, fmt } = items[0];
    const opt = getDisplayOptions();
    const brand = getBrandValue(row, detected);
    const logoImg = await loadBrandLogo(brand);
    const barcodeValue = detected.gencode ? row[detected.gencode] : "";
    const gencodeText = normalizeGencode(barcodeValue);
    const barcode = opt.showBarcode ? makeBarcodeDataUrl(barcodeValue, fmt.key === "large" ? 30 : 94, fmt.key === "large" ? 20 : 16, opt.exportBW) : null;
    const designationLines = getDesignationLines(row, detected);

    const pxPerMm = 3.15;
    const w = Math.max(260, fmt.widthMm * pxPerMm);
    const h = Math.max(140, fmt.heightMm * pxPerMm);

    if (fmt.key === "small") {
      const logoHtml = logoImg ? `<img class="small-logo" src="${logoImg.src}" alt="Logo">` : "";
      const titleFontSize = getSmallTitleFontSize(designationLines);
      const desiHtml = opt.showDesignation
        ? designationLines.map((line) => `<span>${escapeHtml(line.text)}</span>`).join("")
        : "";

      previewEl.innerHTML = `
        <div class="preview-label small-label" style="width:${w}px;height:${h}px;">
          <div class="small-top">
            <div class="small-logo-box">${logoHtml}</div>
            <div class="small-title" style="font-size:${titleFontSize}px;">${desiHtml}</div>
          </div>
          ${opt.showSku && detected.sku ? `<div class="small-sku">SKU : ${escapeHtml(row[detected.sku])}</div>` : `<div class="small-sku"></div>`}
          ${barcode ? `<div class="barcode-wrap"><img src="${barcode.url}" style="width:100%;height:58px;image-rendering:pixelated;object-fit:fill;" alt="Code barre"></div>` : `<div style="height:58px"></div>`}
          <div class="barcode-number" style="position:relative;z-index:2;background:white;">${opt.showGencode ? escapeHtml(gencodeText) : ""}</div>
        </div>`;
    } else {
      const logoHtml = logoImg ? `<img class="large-logo" src="${logoImg.src}" alt="Logo">` : "";
      const contentRows = getLinkedContentRows(row, detected).slice(0, 11);
      const contentHtml = contentRows.length
        ? `<table class="content-table"><thead><tr><th>SKU</th><th>Désignation</th><th>Qté</th></tr></thead><tbody>${
            contentRows.map((r) => `<tr><td>${escapeHtml(r.sku)}</td><td>${escapeHtml(r.designation)}</td><td style="text-align:center;">${escapeHtml(r.quantity)}</td></tr>`).join("")
          }</tbody></table>`
        : `<div style="padding:6mm;color:#667085;font-size:13px;">Aucune ligne trouvée dans la feuille Contenu pour ce SKU.</div>`;

      const mainLabel = (detected.product && row[detected.product]) || (designationLines[0] && designationLines[0].text) || "";

      previewEl.innerHTML = `
        <div class="preview-label large-label" style="width:${w}px;height:${h}px;">
          <div class="large-header">
            <div class="large-left">
              <div class="large-logo-box">${logoHtml}</div>
              <div class="large-slogan">Demandez plus<br>à la ventilation</div>
            </div>
            <div class="large-right">
              <div class="large-code-box">${opt.showSku && detected.sku ? `CODE : ${escapeHtml(row[detected.sku])}` : ""}</div>
              <div class="large-brand-box">${!logoImg && !isNoName(brand) ? escapeHtml(brand) : ""}</div>
            </div>
          </div>
          <div class="large-mid">
            <div class="large-desi-box">
              <div class="band">DÉSIGNATION</div>
              <div class="large-desi-value">${opt.showDesignation ? escapeHtml(mainLabel) : ""}</div>
            </div>
            <div class="large-barcode-box">
              ${barcode ? `<img src="${barcode.url}" style="width:100%;height:68px;image-rendering:pixelated;object-fit:contain;" alt="Code barre">` : `<div style="height:68px"></div>`}
              <div class="large-barcode-number">${opt.showGencode ? escapeHtml(gencodeText) : ""}</div>
            </div>
          </div>
          <div class="large-content">
            <div class="band">CONTENU DU KIT</div>
            <div>${contentHtml}</div>
          </div>
          <div class="large-footer">VMI-TECHNOLOGIES.COM</div>
        </div>`;
    }

    setStatus("Aperçu chargé.");
  }

  function docToBlob(doc) {
    try {
      const ab = doc.output("arraybuffer");
      return new Blob([ab], { type: "application/pdf" });
    } catch (err) {
      return doc.output("blob");
    }
  }

  function sanitizeFilenamePart(value) {
    return String(value || "etiquette").replace(/[\\/:*?"<>|]/g, "_").trim() || "etiquette";
  }

  async function addOneLabelToDoc(doc, row, detected, fmt, opt) {
    const width = fmt.widthMm;
    const height = fmt.heightMm;
    const brand = getBrandValue(row, detected);
    const logoImg = await loadBrandLogo(brand);
    const gencodeText = detected.gencode ? normalizeGencode(row[detected.gencode]) : "";
    const designationLines = getDesignationLines(row, detected);

    if (fmt.key === "small") {
      const marginX = 3;
      const topY = 3;
      const usableWidth = width - 2 * marginX;
      const logoW = 24;
      const logoH = 9;
      const gap = 2.5;
      const textStartX = marginX + logoW + gap;
      const titleWidth = usableWidth - logoW - gap;
      const titleFont = getSmallTitleFontSize(designationLines);

      if (logoImg) {
        const dataUrl = imageToDataUrl(logoImg, opt.exportBW);
        await drawImageContained(doc, dataUrl, marginX, topY, logoW, logoH);
      }

      let y = topY + 4.1;
      if (opt.showDesignation && designationLines.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(Math.max(8.4, titleFont * 0.58));
        const merged = designationLines.map((x) => x.text).join("\n");
        const lines = doc.splitTextToSize(String(merged), titleWidth);
        doc.text(lines.slice(0, 3), textStartX, y);
      }

      let afterTopY = Math.max(topY + logoH + 1.6, topY + 15.2);
      if (opt.showSku && detected.sku && row[detected.sku]) {
        doc.setFont("courier", "normal");
        doc.setFontSize(9.3);
        doc.text(`SKU : ${String(row[detected.sku])}`, marginX, afterTopY);
        afterTopY += 4.8;
      }

      if (opt.showBarcode && detected.gencode && row[detected.gencode]) {
        const barcode = makeBarcodeDataUrl(row[detected.gencode], usableWidth, 16, opt.exportBW);
        if (barcode) {
          doc.addImage(barcode.url, "PNG", marginX, afterTopY + 0.2, usableWidth, 14.8, undefined, "FAST");
        }
      }

      if (opt.showGencode && gencodeText) {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, height - 6.6, width, 5.6, "F");
        doc.setFont("courier", "normal");
        doc.setFontSize(10.8);
        doc.text(gencodeText, width / 2, height - 2.0, { align: "center" });
      }
      return;
    }

    doc.setDrawColor(127, 127, 127);
    if (opt.exportBW) {
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(0, 0, 0);
    } else {
      doc.setTextColor(29, 32, 66);
      doc.setFillColor(109, 71, 170);
    }

    const leftW = 86;
    const rightW = width - leftW;
    const headerH = 34;
    const bandH = 8;
    const midH = 28;
    const footerH = 10;

    doc.rect(0, 0, width, height);
    doc.line(leftW, 0, leftW, headerH);
    doc.line(0, headerH, width, headerH);

    if (logoImg) {
      const dataUrl = imageToDataUrl(logoImg, opt.exportBW);
      await drawImageContained(doc, dataUrl, 6, 6, 36, 16);
    }
    doc.line(46, 6, 46, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DEMANDEZ PLUS", 52, 12);
    doc.text("À LA VENTILATION", 52, 17);

    doc.rect(leftW, 0, rightW, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    if (opt.showSku && detected.sku && row[detected.sku]) {
      doc.text(`CODE : ${String(row[detected.sku])}`, leftW + 6, 8);
    }

    if (opt.exportBW) {
      doc.setTextColor(0, 0, 0);
    } else {
      doc.setTextColor(109, 71, 170);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    if (!logoImg && !isNoName(brand)) {
      doc.text(String(brand), leftW + rightW / 2, 23, { align: "center" });
    }

    const midTop = headerH;
    doc.rect(0, midTop, width - 36, bandH, "S");
    doc.rect(width - 36, midTop, 36, midH, "S");
    doc.rect(0, midTop + bandH, width - 36, midH - bandH, "S");
    doc.line(width - 36, midTop, width - 36, midTop + midH);

    if (opt.exportBW) {
      doc.setFillColor(0, 0, 0);
    } else {
      doc.setFillColor(109, 71, 170);
    }
    doc.rect(0, midTop, width - 36, bandH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DÉSIGNATION", (width - 36) / 2, midTop + 5.5, { align: "center" });

    if (opt.exportBW) {
      doc.setTextColor(0, 0, 0);
    } else {
      doc.setTextColor(29, 32, 66);
    }
    const mainLabel = (detected.product && row[detected.product]) || (designationLines[0] && designationLines[0].text) || "";
    if (opt.showDesignation && mainLabel) {
      doc.setFontSize(13);
      const lines = doc.splitTextToSize(String(mainLabel), width - 48);
      doc.text(lines.slice(0, 2), (width - 36) / 2, midTop + 17, { align: "center" });
    }

    if (opt.showBarcode && detected.gencode && row[detected.gencode]) {
      const barcode = makeBarcodeDataUrl(row[detected.gencode], 30, 18, opt.exportBW);
      if (barcode) {
        doc.addImage(barcode.url, "PNG", width - 34, midTop + 3, 32, 17, undefined, "FAST");
      }
    }
    if (opt.showGencode && gencodeText) {
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.text(gencodeText, width - 18, midTop + 26, { align: "center" });
    }

    const contentTop = midTop + midH;
    if (opt.exportBW) {
      doc.setFillColor(0, 0, 0);
    } else {
      doc.setFillColor(109, 71, 170);
    }
    doc.rect(0, contentTop, width, bandH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("CONTENU DU KIT", width / 2, contentTop + 5.5, { align: "center" });

    if (opt.exportBW) {
      doc.setTextColor(0, 0, 0);
    } else {
      doc.setTextColor(29, 32, 66);
    }

    const boxY = contentTop + bandH;
    const boxH = height - contentTop - bandH - footerH;
    doc.rect(0, boxY, width, boxH, "S");

    const contentRows = getLinkedContentRows(row, detected).slice(0, 11);
    if (contentRows.length) {
      const xSku = 0;
      const skuW = 22;
      const qtyW = 12;
      const xDes = skuW;
      const desW = width - skuW - qtyW;
      const xQty = width - qtyW;
      const rowH = boxH / (contentRows.length + 1);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.line(xDes, boxY, xDes, boxY + boxH);
      doc.line(xQty, boxY, xQty, boxY + boxH);
      for (let i = 0; i <= contentRows.length; i += 1) {
        doc.line(0, boxY + i * rowH, width, boxY + i * rowH);
      }
      doc.text("SKU", xSku + skuW / 2, boxY + rowH * 0.65, { align: "center" });
      doc.text("Désignation", xDes + desW / 2, boxY + rowH * 0.65, { align: "center" });
      doc.text("Qté", xQty + qtyW / 2, boxY + rowH * 0.65, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      contentRows.forEach((r, idx) => {
        const y = boxY + rowH * (idx + 1) + rowH * 0.6;
        doc.text(String(r.sku || ""), xSku + 2, y);
        const lines = doc.splitTextToSize(String(r.designation || ""), desW - 4);
        doc.text(lines.slice(0, 2), xDes + 2, y - 1.2);
        doc.text(String(r.quantity || ""), xQty + qtyW / 2, y, { align: "center" });
      });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("VMI-TECHNOLOGIES.COM", width / 2, height - 4, { align: "center" });
  }

  async function generatePdf(singleFilePerLabel = false) {
    if (!rows.length) {
      setStatus("Charge d'abord un fichier Excel.");
      return;
    }

    clearDownloads();

    try {
      const { jsPDF } = window.jspdf;
      const items = preparedRows();
      const detected = detectColumns(headers);
      const opt = getDisplayOptions();

      const invalidEans = [];
      for (const { row } of items) {
        if (detected.gencode && row[detected.gencode]) {
          const info = barcodeFormatInfo(row[detected.gencode]);
          if (!info.isEan) invalidEans.push(row[detected.gencode]);
        }
      }

      if (singleFilePerLabel) {
        const zip = new JSZip();
        for (const { row, fmt } of items) {
          const doc = new jsPDF({
            orientation: fmt.widthMm >= fmt.heightMm ? "landscape" : "portrait",
            unit: "mm",
            format: [fmt.widthMm, fmt.heightMm],
          });
          await addOneLabelToDoc(doc, row, detected, fmt, opt);
          const name = `${sanitizeFilenamePart(detected.sku ? row[detected.sku] : "etiquette")}.pdf`;
          zip.file(name, docToBlob(doc));
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = addDownloadCard(zipBlob, "PDF_par_etiquette.zip");
        try { link.dl.click(); } catch (err) {}
        let msg = `${items.length} PDF préparé(s) dans le ZIP.`;
        if (invalidEans.length) {
          msg += `\n${invalidEans.length} gencode(s) ne sont pas des EAN-13 valides : CODE128 a été utilisé.`;
        }
        msg += "\nLe lien de téléchargement est affiché sous les boutons.";
        setStatus(msg);
        return;
      }

      let doc = null;
      let pageCount = 0;
      for (const { row, fmt } of items) {
        if (!doc) {
          doc = new jsPDF({
            orientation: fmt.widthMm >= fmt.heightMm ? "landscape" : "portrait",
            unit: "mm",
            format: [fmt.widthMm, fmt.heightMm],
          });
        } else {
          doc.addPage([fmt.widthMm, fmt.heightMm], fmt.widthMm >= fmt.heightMm ? "landscape" : "portrait");
        }
        pageCount += 1;
        await addOneLabelToDoc(doc, row, detected, fmt, opt);
      }

      const filename = pageCount === 1
        ? `${sanitizeFilenamePart(detected.sku && rows[0][detected.sku] ? rows[0][detected.sku] : "etiquette")}.pdf`
        : "Créations d'étiquettes.pdf";

      const blob = docToBlob(doc);
      const link = addDownloadCard(blob, filename);
      try { link.dl.click(); } catch (err) {}

      let msg = `PDF généré avec succès : ${pageCount} étiquette(s).`;
      if (invalidEans.length) {
        msg += `\n${invalidEans.length} gencode(s) ne sont pas des EAN-13 valides : CODE128 a été utilisé.`;
      }
      msg += "\nLe lien de téléchargement est affiché sous les boutons.";
      setStatus(msg);
    } catch (err) {
      setStatus("Erreur pendant la génération : " + (err && err.message ? err.message : String(err)));
    }
  }

  function readActiveSheet() {
    if (!workbook) return;
    const sheet = workbook.Sheets[sheetSelect.value];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    headers = rows.length ? Object.keys(rows[0]) : [];
    renderTable(rows);

    const detected = detectColumns(headers);
    const contentRows = getContentSheetRows();
    const contentCols = contentRows.length ? detectContentColumns(Object.keys(contentRows[0] || {})) : null;

    setStatus(
      `Fichier chargé : ${rows.length} ligne(s).\n` +
      `Colonnes détectées - Produits : label format=${detected.labelFormat || "-"}, brand=${detected.brand || "-"}, SKU=${detected.sku || "-"}, product=${detected.product || "-"}, gencode=${detected.gencode || "-"}, FR=${detected.desFR || "-"}, EN=${detected.desEN || "-"}, ES=${detected.desES || "-"}, IT=${detected.desIT || "-"}, PT=${detected.desPT || "-"}\n` +
      `Feuille contenu : ${contentRows.length ? "trouvée" : "non trouvée"}${contentCols ? ` | parent SKU=${contentCols.parentSku || "-"}, SKU=${contentCols.sku || "-"}, désignation=${contentCols.designation || "-"}, quantité=${contentCols.quantity || "-"}` : ""}`
    );
    clearDownloads();
  }

  document.getElementById("excelFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    workbook = XLSX.read(data, { type: "array" });

    sheetSelect.innerHTML = "";
    workbook.SheetNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      sheetSelect.appendChild(option);
    });

    if (workbook.SheetNames.includes("Feuil1")) {
      sheetSelect.value = "Feuil1";
    }
    readActiveSheet();
  });

  sheetSelect.addEventListener("change", readActiveSheet);
  document.getElementById("previewBtn").addEventListener("click", previewFirst);
  document.getElementById("generateBtn").addEventListener("click", () => generatePdf(false));
  document.getElementById("generateZipBtn").addEventListener("click", () => generatePdf(true));
  labelFormatEl.addEventListener("change", previewFirst);
  ["langFR","langEN","langES","langIT","langPT"].forEach((id) => {
    document.getElementById(id).addEventListener("change", previewFirst);
  });
})();
