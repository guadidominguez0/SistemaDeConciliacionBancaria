/**
 * Permite seguir accediendo como Web App independiente si lo deseás.
 */
function doGet() {
  return HtmlService.createTemplateFromFile("Index").evaluate();
}

/**
 * Crea un menú personalizado en la barra superior de Google Sheets al abrir el documento.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Conciliador 🤖")
    .addItem("Abrir Panel Lateral", "mostrarSidebar")
    .addToUi();
}

/**
 * Abre la interfaz "Index.html" directamente en el panel lateral derecho de Google Sheets.
 */
function mostrarSidebar() {
  const html = HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Conciliador Inteligente");
  
  SpreadsheetApp.getUi().showSidebar(html);
}

// ============================================================
// PARSERS DE ARCHIVOS
// ============================================================

/**
 * Convierte base64 a Blob según el tipo MIME
 */
function base64ABlob(base64Data, mimeType) {
  let byteString = Utilities.base64Decode(base64Data);
  return Utilities.newBlob(byteString, mimeType);
}

/**
 * Detecta el tipo de archivo por su extensión (Filtrado solo para CSV y Excel)
 */
function detectarTipoArchivo(nombre, mimeType) {
  let ext = nombre.split(".").pop().toLowerCase();
  if (ext === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "xls"  || mimeType === "application/vnd.ms-excel") return "xls";
  if (ext === "csv"  || mimeType === "text/csv" || mimeType === "text/plain") return "csv";
  return "no_soportado";
}

// ──────────────────────────────────────────────────────────────
// CSV
// ──────────────────────────────────────────────────────────────

/**
 * Limpia una celda quitando comillas externas
 */
function limpiarCelda(valor) {
  return (valor || "").replace(/^"|"$/g, "").trim();
}

/**
 * Limpia un valor monetario y lo deja listo para parseFloat
 * Soporta: $1.234,56 / 1,234.56 / 1234.56 / -1234,56
 */
function limpiarMonto(valor) {
  let s = (valor || "")
    .replace(/^"|"$/g, "")
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .trim();

  if (s === "" || s === "-") return "NaN";

  // Caso: punto como separador de miles Y coma como decimal → 12.450,00
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    return s.replace(/\./g, "").replace(",", ".");
  }

  // Caso: coma como separador de miles Y punto como decimal → 12,450.00
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    return s.replace(/,/g, "");
  }

  // Caso: solo coma decimal → 12450,00
  if (/^\d+,\d{1,2}$/.test(s)) {
    return s.replace(",", ".");
  }

  // Caso: solo punto decimal → 12450.00
  if (/^\d+\.\d{1,2}$/.test(s)) {
    return s;
  }

  // Caso: número entero sin decimales
  if (/^\d+$/.test(s)) {
    return s;
  }

  // Fallback: eliminar todo excepto dígitos, punto y signo
  return s.replace(/[^\d.\-]/g, "");
}

/**
 * Divide una fila de CSV respetando comillas
 */
function splitFila(fila, sep) {
  let resultado = [];
  let enComillas = false;
  let celda = "";
  for (let i = 0; i < fila.length; i++) {
    let c = fila[i];
    if (c === '"') {
      enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      resultado.push(celda.trim());
      celda = "";
    } else {
      celda += c;
    }
  }
  resultado.push(celda.trim());
  return resultado;
}

/**
 * Parsea un texto CSV y retorna array de { fecha, comercio, monto }
 */
function parsearCSV(texto) {
  // Detectar separador
  let lineasMuestra = texto.split(/\r?\n/).slice(0, 5).join("\n");
  let cuentaComa      = (lineasMuestra.match(/,/g)  || []).length;
  let cuentaPuntoComa = (lineasMuestra.match(/;/g)  || []).length;
  let cuentaTab       = (lineasMuestra.match(/\t/g) || []).length;

  let sep = ",";
  if (cuentaPuntoComa > cuentaComa && cuentaPuntoComa > cuentaTab) sep = ";";
  else if (cuentaTab > cuentaComa && cuentaTab > cuentaPuntoComa)  sep = "\t";

  Logger.log("parsearCSV → separador detectado: '" + sep + "'");

  let filas = texto.trim().split(/\r?\n/);
  let movimientos = [];
  let inicioData = 0;

  // Detectar fila de encabezado
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    let cols = splitFila(filas[i], sep);
    let primera = limpiarCelda(cols[0]).toLowerCase();
    if (
      primera.includes("fecha") || primera.includes("date") ||
      primera.includes("día")   || primera.includes("dia")
    ) {
      inicioData = i + 1;
      Logger.log("parsearCSV → encabezado en fila " + i + ", datos desde fila " + inicioData);
      break;
    }
  }

  for (let i = inicioData; i < filas.length; i++) {
    let cols = splitFila(filas[i], sep);
    if (cols.length < 2) continue;

    let fecha = limpiarCelda(cols[0]);
    if (!fecha || fecha.length < 4 || !/\d/.test(fecha)) continue;

    // Saltar filas de totales o encabezados intermedios
    let fechaLower = fecha.toLowerCase();
    if (
      fechaLower.includes("total") || fechaLower.includes("saldo") ||
      fechaLower.includes("fecha") || fechaLower.includes("subtotal")
    ) continue;

    let comercio = limpiarCelda(cols[1]) || "Sin descripción";

    // Buscar monto en columnas 2 en adelante
    let montoNum = NaN;
    for (let c = 2; c < Math.min(cols.length, 8); c++) {
      let celda = limpiarCelda(cols[c]);
      if (!celda || celda === "") continue;
      let raw = limpiarMonto(celda);
      let n   = parseFloat(raw);
      if (!isNaN(n) && n !== 0) {
        montoNum = n;
        break;
      }
    }

    if (!isNaN(montoNum)) {
      movimientos.push({ fecha: fecha, comercio: comercio, monto: montoNum });
      Logger.log("parsearCSV → fila " + i + ": " + fecha + " | " + comercio + " | " + montoNum);
    } else {
      Logger.log("parsearCSV → fila " + i + " SKIP (sin monto): " + filas[i]);
    }
  }

  Logger.log("parsearCSV → total: " + movimientos.length + " movimientos");
  return movimientos;
}

// ──────────────────────────────────────────────────────────────
// XLSX / XLS
// ──────────────────────────────────────────────────────────────

/**
 * Convierte XLSX/XLS a Google Sheets temporalmente y extrae datos
 */
function parsearXLSX(blob) {
  let archivoId = null;
  let sheetId   = null;

  try {
    let archivo = DriveApp.createFile(blob);
    archivoId = archivo.getId();

    let respuesta = Drive.Files.copy(
      { title: "temp_xlsx_" + Date.now(), mimeType: MimeType.GOOGLE_SHEETS },
      archivoId
    );
    sheetId = respuesta.id;

    let ss   = SpreadsheetApp.openById(sheetId);
    let hoja = ss.getSheets()[0];
    let datos = hoja.getDataRange().getValues();

    let movimientos = [];
    let inicio = 0;

    // Detectar encabezado
    for (let i = 0; i < Math.min(datos.length, 15); i++) {
      let primera = String(datos[i][0]).toLowerCase().trim();
      if (
        primera.includes("fecha") || primera.includes("date") ||
        primera.includes("día")   || primera.includes("dia")
      ) {
        inicio = i + 1;
        break;
      }
    }

    for (let i = inicio; i < datos.length; i++) {
      let fila = datos[i];
      let fecha = fila[0];
      if (!fecha) continue;

      if (fecha instanceof Date) {
        fecha = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "dd/MM/yyyy");
      } else {
        fecha = String(fecha).trim();
      }
      if (fecha.length < 4 || !/\d/.test(fecha)) continue;

      let comercio = String(fila[1] || "Sin descripción").trim();

      let monto = NaN;
      for (let c = 2; c < Math.min(fila.length, 7); c++) {
        let raw = String(fila[c]).replace(",", ".").replace(/[^\d.\-]/g, "");
        let n   = parseFloat(raw);
        if (!isNaN(n) && n !== 0) { monto = n; break; }
      }

      if (!isNaN(monto)) {
        movimientos.push({ fecha: fecha, comercio: comercio, monto: monto });
      }
    }

    Logger.log("parsearXLSX → " + movimientos.length + " movimientos");
    return movimientos;

  } catch (e) {
    throw new Error("No se pudo leer el XLSX/XLS. Detalle: " + e.message);
  } finally {
    try { if (archivoId) DriveApp.getFileById(archivoId).setTrashed(true); } catch(e) {}
    try { if (sheetId)   DriveApp.getFileById(sheetId).setTrashed(true);   } catch(e) {}
  }
}

// ──────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL (SÓLO CSV Y EXCEL)
// ──────────────────────────────────────────────────────────────

/**
 * Detecta el tipo de archivo y delega al parser correspondiente (CSV o Excel)
 */
function extraerMovimientos(base64Data, nombreArchivo, mimeType) {
  let tipo = detectarTipoArchivo(nombreArchivo, mimeType);
  let blob = base64ABlob(base64Data, mimeType);
  blob = blob.setName(nombreArchivo);

  Logger.log("extraerMovimientos → archivo: " + nombreArchivo + " | tipo detectado: " + tipo);

  if (tipo === "csv") {
    let texto = blob.getDataAsString("UTF-8");
    return parsearCSV(texto);
  }

  if (tipo === "xlsx" || tipo === "xls") {
    // XLSX/XLS requiere Drive API avanzada para la conversión
    if (typeof Drive === "undefined") {
      throw new Error(
        "Para leer archivos XLSX/XLS se necesita la Drive API v2.\n" +
        "Actívela en: editor Apps Script → Servicios (+) → Drive API → Agregar.\n" +
        "Alternativa: exporte el archivo como CSV."
      );
    }
    return parsearXLSX(blob);
  }

  // Lanzar error si se intenta cargar un PDF o cualquier otro archivo no soportado
  throw new Error("Formato no admitido: " + nombreArchivo + ". Únicamente se permiten archivos CSV, XLSX o XLS.");
}

// ============================================================
// FECHAS
// ============================================================

/**
 * Parsea fechas en múltiples formatos al objeto Date
 * Prioriza formato argentino dd/mm/yyyy
 */
function parsearFecha(str) {
  if (!str) return null;
  str = String(str).trim();

  let p;

  // ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    p = str.substring(0, 10).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  // dd/mm/yyyy o dd-mm-yyyy
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
    p = str.split(/[\/\-]/);
    return new Date(+p[2], +p[1] - 1, +p[0]);
  }

  // dd/mm/yy o dd-mm-yy
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(str)) {
    p = str.split(/[\/\-]/);
    return new Date(2000 + +p[2], +p[1] - 1, +p[0]);
  }

  // Último recurso nativo
  let d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Diferencia en días absoluta entre dos fechas
 */
function diffDias(f1, f2) {
  if (!f1 || !f2) return 9999;
  return Math.round(Math.abs(f1.getTime() - f2.getTime()) / 86400000);
}

// ============================================================
// CONCILIACIÓN PRINCIPAL
// ============================================================

/**
 * Función llamada desde el HTML.
 * Recibe formData con los archivos en base64 y los parámetros de tolerancia.
 */
function procesarDobleConciliacion(formData) {
  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();

    // ── 1. Preparar nombres dinámicos de las hojas ───────────
    let sufijo = formData.nombreProceso ? " (" + formData.nombreProceso + ")" : "";
    let nombreHojaBanco = "Resumen Bancario" + sufijo;
    let nombreHojaContable = "Tabla Contable" + sufijo;
    let nombreHojaConciliacion = "Conciliación" + sufijo;

    let hojaBanco        = obtenerOCrearHoja(libro, nombreHojaBanco);
    let hojaContable     = obtenerOCrearHoja(libro, nombreHojaContable);
    let hojaConciliacion = obtenerOCrearHoja(libro, nombreHojaConciliacion);

    hojaBanco.clear();
    hojaContable.clear();
    hojaConciliacion.clear();

    let hdBanco = ["Fecha Banco", "Concepto / Comercio", "Monto ($)"];
    let hdCont  = ["Fecha Contable", "Concepto / Comercio", "Monto ($)"];
    let hdConc  = ["Fecha Banco", "Concepto", "Monto Banco ($)", "Estado", "Diferencia ($)", "Observación"];

    hojaBanco.appendRow(hdBanco);
    hojaContable.appendRow(hdCont);
    hojaConciliacion.appendRow(hdConc);

    aplicarEstiloEncabezado(hojaBanco.getRange(1, 1, 1, hdBanco.length));
    aplicarEstiloEncabezado(hojaContable.getRange(1, 1, 1, hdCont.length));
    aplicarEstiloEncabezado(hojaConciliacion.getRange(1, 1, 1, hdConc.length));

    // ── 2. Extracto bancario (obligatorio) ───────────────────
    let movsBanco = extraerMovimientos(
      formData.archivoBancoBase64,
      formData.archivoBancoNombre,
      formData.archivoBancoMime
    );

    if (movsBanco.length === 0) {
      return {
        exito: false,
        mensaje: "No se encontraron movimientos en el extracto bancario. " +
                 "Verifique que el archivo tenga columnas de fecha, descripción y monto."
      };
    }

    // Llenar hoja Resumen Bancario
    let filasBanco = movsBanco.map(m => [m.fecha, m.comercio, m.monto]);
    hojaBanco.getRange(2, 1, filasBanco.length, 3).setValues(filasBanco);
    hojaBanco.getRange(2, 3, filasBanco.length, 1).setNumberFormat("$ #,##0.00");
    Logger.log("Hoja '" + nombreHojaBanco + "' llenada con " + filasBanco.length + " filas");

    // ── 3. Tabla contable (opcional) ─────────────────────────
    let movsContables = [];
    if (formData.archivoContableBase64) {
      movsContables = extraerMovimientos(
        formData.archivoContableBase64,
        formData.archivoContableNombre,
        formData.archivoContableMime
      );
      if (movsContables.length > 0) {
        let filasContables = movsContables.map(m => [m.fecha, m.comercio, m.monto]);
        hojaContable.getRange(2, 1, filasContables.length, 3).setValues(filasContables);
        hojaContable.getRange(2, 3, filasContables.length, 1).setNumberFormat("$ #,##0.00");
        Logger.log("Hoja '" + nombreHojaContable + "' llenada con " + filasContables.length + " filas");
      }
    }

    // ── 4. Conciliación ──────────────────────────────────────
    let diasTol = parseInt(formData.diasTolerancia)       || 2;
    let pctTol  = parseFloat(formData.porcentajeTolerancia) / 100 || 0.02;

    let contConciliados = 0;
    let contDudas       = 0;
    let contAlertas     = 0;
    let usados          = new Array(movsContables.length).fill(false);

    let filasConciliacion = [];
    let coloresConciliacion = [];

    movsBanco.forEach(mb => {
      let fechaB      = parsearFecha(mb.fecha);
      let mejorMatch  = null;
      let mejorIdx    = -1;
      let mejorScore  = Infinity;

      movsContables.forEach((mc, idx) => {
        if (usados[idx]) return;
        let fechaC  = parsearFecha(mc.fecha);
        let dDias   = diffDias(fechaB, fechaC);
        let dMonto  = Math.abs(mc.monto - mb.monto);
        let pctDif  = mb.monto !== 0 ? dMonto / Math.abs(mb.monto) : (dMonto > 0 ? 1 : 0);

        if (dDias <= diasTol && pctDif <= pctTol) {
          let score = dDias + pctDif * 10;
          if (score < mejorScore) {
            mejorScore = score;
            mejorMatch = mc;
            mejorIdx   = idx;
          }
        }
      });

      let estado, diferencia, observacion, color;

      if (movsContables.length === 0) {
        // Sin tabla contable cargada
        estado      = "📋 SIN CONTRAPARTIDA";
        diferencia  = 0;
        observacion = "No se cargó tabla contable";
        color       = "#e2e3e5";
        contDudas++;

      } else if (mejorMatch !== null) {
        usados[mejorIdx] = true;
        diferencia = mejorMatch.monto - mb.monto;

        if (Math.abs(diferencia) < 0.01) {
          estado      = "✅ CONCILIADO";
          observacion = "Coincidencia exacta";
          color       = "#d4edda";
          contConciliados++;
        } else {
          estado      = "⚠️ EN DUDAS";
          observacion = "Diferencia dentro de tolerancia";
          color       = "#fff3cd";
          contDudas++;
        }

      } else {
        estado      = "❌ ALERTA";
        diferencia  = mb.monto;
        observacion = "Sin movimiento contable correspondiente";
        color       = "#f8d7da";
        contAlertas++;
      }

      filasConciliacion.push([mb.fecha, mb.comercio, mb.monto, estado, diferencia, observacion]);
      coloresConciliacion.push(color);
    });

    // Escribir conciliación de una sola vez (más eficiente)
    if (filasConciliacion.length > 0) {
      let rango = hojaConciliacion.getRange(2, 1, filasConciliacion.length, 6);
      rango.setValues(filasConciliacion);

      // Aplicar colores fila por fila
      coloresConciliacion.forEach((color, i) => {
        hojaConciliacion.getRange(i + 2, 1, 1, 6).setBackground(color);
      });

      hojaConciliacion.getRange(2, 3, filasConciliacion.length, 1).setNumberFormat("$ #,##0.00");
      hojaConciliacion.getRange(2, 5, filasConciliacion.length, 1).setNumberFormat("$ #,##0.00");
    }

    Logger.log("Hoja '" + nombreHojaConciliacion + "' llenada con " + filasConciliacion.length + " filas");

    // Ajustar columnas
    [hojaBanco, hojaContable, hojaConciliacion].forEach(h => {
      try { h.autoResizeColumns(1, 6); } catch(e) {}
    });

    return {
      exito:        true,
      conciliados:  contConciliados,
      dudas:        contDudas,
      alertas:      contAlertas
    };

  } catch (e) {
    Logger.log("ERROR en procesarDobleConciliacion: " + e.message + "\n" + e.stack);
    return { exito: false, mensaje: e.message || e.toString() };
  }
}

// ============================================================
// UTILIDADES
// ============================================================

function obtenerOCrearHoja(libro, nombre) {
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre);
}

function aplicarEstiloEncabezado(rango) {
  rango
    .setBackground("#1a73e8")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}
