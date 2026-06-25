# 🤖 Conciliador Inteligente

Herramienta de conciliación bancaria automatizada construida sobre **Google Apps Script** y **Google Sheets**. Permite comparar un extracto bancario contra una tabla contable (ambos en CSV, XLSX o XLS) y genera hojas de resultados con codificación de colores directamente en el spreadsheet activo.

---

## ✨ Características

- **Interfaz lateral** integrada en Google Sheets (sidebar) y disponible también como Web App independiente
- **Parseo multi-formato**: CSV (separadores `,` `;` `\t` detectados automáticamente), XLSX y XLS
- **Tolerancia configurable**: días de diferencia y porcentaje de variación de monto
- **Lógica de conciliación doble**: banco obligatorio + contable opcional
- **Resultados codificados por color**:
  - 🟢 `CONCILIADO` — coincidencia exacta
  - 🟡 `EN DUDAS` — diferencia dentro de tolerancia
  - 🔴 `ALERTA` — sin movimiento contable correspondiente
  - ⚪ `SIN CONTRAPARTIDA` — no se cargó tabla contable
- **KPIs instantáneos** al finalizar el proceso (conciliados / dudas / alertas)
- **Soporte de moneda argentina**: parsea montos con puntos de miles y coma decimal (`$1.234,56`)
- **Hojas dinámicas por proceso**: se pueden correr múltiples conciliaciones en el mismo libro usando el campo "Nombre del proceso"

---

## 📁 Estructura del proyecto

```
conciliador-inteligente/
├── codigo.gs        # Lógica backend en Google Apps Script
└── Interfaz.html    # Panel lateral / Web App (HTML + Tailwind CSS)
```

---

## 🚀 Cómo implementarlo (paso a paso)

### Prerrequisitos

- Cuenta de Google
- Acceso a [Google Sheets](https://sheets.google.com)
- Sin instalaciones adicionales — todo corre en la nube de Google

---

### Paso 1 — Crear el Google Sheet

1. Abrí [Google Sheets](https://sheets.google.com) y creá un nuevo spreadsheet.
2. Poné el nombre que quieras, por ejemplo: **Conciliador Inteligente**.

---

### Paso 2 — Abrir el editor de Apps Script

1. En el menú superior, andá a **Extensiones → Apps Script**.
2. Se va a abrir el editor de código en una nueva pestaña.

---

### Paso 3 — Configurar los archivos del proyecto

El editor viene con un archivo llamado `Code.gs`. Vas a reemplazar ese contenido y agregar el HTML.

#### 3.1 — Cargar el código backend

1. Hacé clic en el archivo `Code.gs` en el panel izquierdo.
2. **Seleccioná todo el contenido** existente y borralo.
3. Pegá el contenido completo de **`codigo.gs`**.
4. Guardá con `Ctrl + S` (o `Cmd + S` en Mac).

#### 3.2 — Agregar el archivo HTML

1. En el panel izquierdo, hacé clic en el **`+`** al lado de "Archivos".
2. Seleccioná **HTML**.
3. Cuando te pida el nombre, escribí exactamente: `Index` *(sin extensión, Apps Script la agrega solo)*.
4. **Borrá** el contenido inicial que trae por defecto.
5. Pegá el contenido completo de **`Interfaz.html`**.
6. Guardá con `Ctrl + S`.

Al terminar deberías ver dos archivos en el panel:
```
Code.gs
Index.html
```

---

### Paso 4 — Habilitar la API de Drive (necesaria para leer XLSX)

El parser de archivos Excel requiere la API avanzada de Google Drive.

1. En el editor de Apps Script, andá al menú **Servicios** (ícono `+` en el panel izquierdo, debajo de "Servicios").
2. Buscá **Drive API** y hacé clic en **Agregar**.
3. Dejá la versión por defecto (v2) y confirmá.

---

### Paso 5 — Autorizar los permisos

1. En el editor, hacé clic en **Ejecutar** (▶) sobre cualquier función, por ejemplo `onOpen`.
2. Google va a pedir que autorices los permisos necesarios:
   - Acceso a Google Sheets
   - Acceso a Google Drive
3. Seguí el flujo de autorización. Si aparece la advertencia "Esta aplicación no está verificada", hacé clic en **Avanzado → Ir a [nombre del proyecto] (no seguro)**. Esto es normal para scripts de uso propio.

---

### Paso 6 — Usar la herramienta

Volvé al spreadsheet de Google Sheets. Vas a ver un nuevo menú llamado **Conciliador 🤖** en la barra superior.

1. Hacé clic en **Conciliador 🤖 → Abrir Panel Lateral**.
2. El panel aparece a la derecha de la pantalla.
3. Cargá el **Extracto Bancario** (CSV, XLSX o XLS) — obligatorio.
4. Cargá la **Tabla Contable** — opcional.
5. Configurá los parámetros de tolerancia y, si querés, un nombre para identificar el proceso.
6. Hacé clic en **Procesar Conciliación**.

El sistema va a crear (o actualizar) las siguientes hojas en tu spreadsheet:
- **Resumen Bancario** — movimientos del banco parseados
- **Tabla Contable** — movimientos contables parseados
- **Conciliación** — resultado con colores y estados

---

### Paso 7 — Publicar como Web App

1. En Apps Script, andá a **Implementar → Nueva implementación**.
2. Hacé clic en el ícono de engranaje y seleccioná **Aplicación web**.
3. Configurá:
   - **Ejecutar como**: Yo (tu cuenta)
   - **Quién tiene acceso**: Solo yo (o el nivel que necesites)
4. Hacé clic en **Implementar** y copiá la URL generada.

---

## ⚙️ Parámetros de tolerancia

| Parámetro | Descripción | Valor por defecto |
|---|---|---|
| Días de tolerancia | Diferencia máxima de días entre fecha banco y fecha contable | 2 días |
| % de tolerancia de monto | Variación máxima aceptada entre montos | 2% |

---

## 📋 Formatos de archivo soportados

| Formato | Notas |
|---|---|
| `.csv` | Separadores `,` `;` y `\t` detectados automáticamente |
| `.xlsx` | Convertido temporalmente a Google Sheets para su lectura |
| `.xls` | Ídem XLSX |

El parser espera columnas en este orden: **Fecha · Descripción/Comercio · Monto**. Detecta automáticamente la fila de encabezado (hasta la fila 15) buscando palabras clave como `fecha`, `date`, `día`.

---

## 🐛 Solución de problemas frecuentes

| Problema | Solución |
|---|---|
| "No se encontraron movimientos" | Verificar que el archivo tenga columnas de fecha, descripción y monto en ese orden |
| Error al leer XLSX | Asegurarse de haber habilitado la **Drive API** en el Paso 4 |
| El menú "Conciliador 🤖" no aparece | Ejecutar manualmente la función `onOpen` desde el editor de Apps Script |
| Montos mal interpretados | El parser soporta `$1.234,56` y `1234.56`; evitar celdas con texto mezclado |

---

## 🛠️ Tecnologías utilizadas

- [Google Apps Script](https://developers.google.com/apps-script)
- [Google Sheets API](https://developers.google.com/sheets)
- [Google Drive API v2](https://developers.google.com/drive)
- [Tailwind CSS](https://tailwindcss.com/) (vía CDN)
- [Lucide Icons](https://lucide.dev/) (vía CDN)
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (Google Fonts)
