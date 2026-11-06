# FotoGestor

Aplicación de escritorio para gestionar el trabajo de un fotógrafo profesional:
clientes, sesiones y la selección (*culling*) de las fotos de cada sesión.

**Stack:** Electron · React · TypeScript · Vite (electron-vite) · SQLite (better-sqlite3) · sharp · exifr

## Funcionalidades (v0.1)

- **Clientes**: alta, edición, búsqueda y número de sesiones por cliente.
- **Sesiones**: cliente, tipo (boda, retrato…), fecha, lugar, precio, notas y estado
  (planificada → realizada → en edición → entregada). Filtros por cliente y estado.
- **Importación** de ficheros o carpetas completas (JPEG, PNG, TIFF, WebP): copia los
  originales a la biblioteca, genera miniaturas y previsualizaciones, lee los EXIF
  (cámara, objetivo, exposición, fecha) y omite duplicados.
- **Selección de fotos** con teclado: `P` elegir, `X` descartar, `U` quitar marca,
  `0–5` estrellas, flechas para navegar, `Enter` visor a pantalla completa,
  `Ctrl/Shift + clic` y `Ctrl+A` para selección múltiple.
- Filtros: todas / elegidas / sin marcar / descartadas / 3+ estrellas.
- **Exportar elegidas** a una carpeta y eliminar las descartadas.
- **Panel** con resumen y próximas sesiones.

## Desarrollo

```bash
npm install        # recompila better-sqlite3 para Electron automáticamente
npm run dev        # arranca la app con recarga en caliente
npm run typecheck
npm run test:e2e   # prueba de extremo a extremo con Playwright
```

En Linux sin pantalla: `xvfb-run -a npm run test:e2e`. Con `KEEP_E2E=1` se conservan
las capturas de la prueba.

## Estructura

```
src/
  main/       proceso principal: base de datos, IPC, importador, almacenamiento
  preload/    puente seguro (contextBridge) → window.api
  renderer/   interfaz en React
  shared/     tipos compartidos entre procesos
scripts/      prueba E2E y generador de imágenes de prueba
```

## Almacenamiento

Los datos se guardan en la carpeta de usuario de la app (`<userData>/biblioteca`), o en
`FOTOGESTOR_DATA_DIR` si está definida:

```
biblioteca/
  fotogestor.db
  sessions/<id>/originals | thumbs | previews
```

La base de datos guarda *keys* relativas, no rutas absolutas, y todo el acceso a ficheros
pasa por la interfaz `PhotoStorage` (`src/main/storage.ts`). Así se podrá añadir más
adelante almacenamiento en la nube (S3, R2, Dropbox…) sin tocar el resto de la app.
