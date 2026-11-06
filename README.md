# FotoGestor

Aplicación de escritorio para gestionar el trabajo de un fotógrafo profesional:
clientes, sesiones, selección de fotos, galerías para clientes y facturación.

**Stack:** Electron · React · TypeScript · Vite (electron-vite) · SQLite (`node:sqlite`, integrado en Electron) · sharp · exifr

## Funcionalidades (v0.3)

- **Clientes**: datos de contacto, NIF y dirección (para facturas), búsqueda y número de sesiones.
- **Sesiones**: cliente, tipo, fecha, lugar, precio, notas, etiquetas y estado
  (planificada → realizada → en edición → entregada).
- **Importación** de ficheros o carpetas: JPEG, PNG, TIFF, WebP y **RAW** (CR2, CR3, NEF, ARW, RAF,
  DNG, ORF, RW2, PEF…). De los RAW se usa la vista previa a resolución completa que guarda la cámara;
  el original se copia intacto. Lee EXIF (cámara, objetivo, exposición, fecha) y omite duplicados.
- **Selección por teclado**: `P` elegir, `X` descartar, `U` quitar marca, `0–5` estrellas, `T` etiquetar,
  flechas, `Enter` visor, `Ctrl/Shift + clic` y `Ctrl+A` para selección múltiple.
- **Etiquetas** en fotos y sesiones, filtro por etiqueta y **búsqueda global** (`Ctrl+K`) de clientes,
  sesiones y fotos (nombre de archivo, etiqueta, cámara, objetivo).
- **Galería para el cliente**: un único `.html` con las fotos (con marca de agua opcional). El cliente lo
  abre en el navegador, marca favoritas con ♥ y devuelve un código que se importa en la sesión.
- **Presupuestos y facturas**: datos del negocio y logotipo, partidas, IVA y retención de IRPF,
  estados, conversión de presupuesto a factura y PDF. Las facturas reciben número correlativo
  (`F-2026-001`) al emitirse y, una vez emitidas, no se pueden editar ni eliminar.
- **Panel** con próximas sesiones, facturado en el año y pendiente de cobro.
- **Actualizaciones automáticas** desde GitHub Releases.

## Desarrollo

```bash
npm install        # no compila nada: todo usa binarios precompilados
npm run dev        # arranca la app con recarga en caliente
npm run typecheck
npm run test:e2e   # prueba de extremo a extremo con Playwright
npm run dist:win   # genera dist/FotoGestor-Setup-<versión>.exe
```

- En Linux sin pantalla: `xvfb-run -a npm run test:e2e`. `KEEP_E2E=1` conserva capturas, galería y PDF;
  `E2E_RAW=/ruta/foto.NEF` añade un RAW real a la prueba.
- `dist:win` desde Linux necesita Wine (`apt install wine wine32:i386 wine64`). En Windows funciona directamente.
- El instalador no está firmado digitalmente: Windows SmartScreen mostrará «Editor desconocido».

## Actualizaciones automáticas

La app instalada busca versiones nuevas en GitHub Releases al arrancar y cada 4 horas. Las descarga
en segundo plano y las instala al cerrarse (o con «Reiniciar y actualizar»). En Ajustes hay un botón
«Buscar actualizaciones». El repositorio debe ser **público** para que la app pueda leer las versiones.

Para publicar una versión nueva:

```bash
npm run release    # sube la versión (0.3.0 → 0.3.1), crea la etiqueta v0.3.1 y la sube
```

Al llegar la etiqueta a GitHub, `.github/workflows/release.yml` pasa las pruebas, compila el instalador
en Windows y lo publica en Releases.

## Estructura

```
src/
  main/       proceso principal: base de datos, IPC, importador, RAW, galería, facturas, ajustes
  preload/    puente seguro (contextBridge) → window.api
  renderer/   interfaz en React
  shared/     tipos compartidos entre procesos
scripts/      prueba E2E, imágenes de prueba e icono
build/        recursos del instalador (icono)
```

## Datos

Se guardan en `%APPDATA%\fotogestor\biblioteca` (Windows), o en `FOTOGESTOR_DATA_DIR` si está definida:

```
biblioteca/
  fotogestor.db
  sessions/<id>/originals | thumbs | previews
```

La base de datos guarda *keys* relativas y todo el acceso a ficheros pasa por `PhotoStorage`
(`src/main/storage.ts`), para poder añadir almacenamiento en la nube más adelante.
**Haz copias de seguridad de esta carpeta**: contiene tus originales y tu facturación.
