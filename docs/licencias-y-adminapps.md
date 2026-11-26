# Especificación: licencias, suscripciones y AdminApps

Documento de referencia para convertir **FotoGestor** y **AppClase** en apps de pago por suscripción
y crear **AdminApps**, el panel desde el que se controlan.

Estado: borrador v1 · noviembre de 2026

---

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Modelo | Suscripción, mensual y anual |
| Prueba | 7 días, **sin tarjeta**, con todas las funciones |
| Al caducar, cancelar o no pagar | La app pasa a **solo lectura**: se ven y exportan los datos, no se crea ni edita nada |
| Conexión | **Obligatoria para abrir la app.** Si se corta mientras se trabaja, la app sigue abierta hasta que se cierre |
| Equipos por suscripción | 2 a la vez |
| Mercado | Todo el mundo |
| Sistemas | Windows (de momento) |
| Datos del usuario | Solo en su ordenador. El servidor no guarda fotos, clientes ni trabajos |
| AdminApps | Web, la usa una sola persona (el propietario) |
| Presupuesto inicial | 0–10 € al mes, ampliable cuando haya clientes |

## 2. Las apps

### FotoGestor
Gestión para fotógrafos profesionales (sobre todo de motorsport): clientes, eventos, fotos, galerías,
tarifas, presupuestos y facturas. Electron + React + TypeScript + SQLite. Ya existe (v0.16).

### AppClase
App de escritorio para **estudiantes**: guardar los trabajos de clase y trabajar con ellos desde el
ordenador. Admite **todo tipo de archivos** (documentos, PDF, imágenes, presentaciones, vídeos…).
Misma tecnología que FotoGestor (Electron + React + TypeScript + SQLite) para compartir el módulo de
licencias y la forma de actualizar. La organización de los trabajos y la edad mínima se decidirán más
adelante (ver §11).

### AdminApps
Panel web privado para controlar usuarios, suscripciones, dispositivos, versiones, avisos y
estadísticas de las dos apps (ver §6).

## 3. Precios orientativos

IVA incluido; Paddle adapta el precio a la moneda de cada país.

| App | Mensual | Anual |
|---|---|---|
| FotoGestor | 9,99 € | 99 € (≈ 2 meses gratis) |
| AppClase | 2,99 € | 24,99 € |

- Paddle cobra en torno al 5 % + 0,50 $ por transacción y retiene y declara los impuestos de cada país.
  Neto aproximado: 9,99 €/mes → ~7,40 €; 99 €/año → ~76 €.
- Un único plan por app al principio. Más adelante se puede añadir un plan Pro.
- Precio de lanzamiento para los primeros usuarios con un cupón (por ejemplo, FotoGestor a 79 €/año
  mientras mantengan la suscripción).

## 4. Arquitectura

```
 FotoGestor ─┐                            ┌─ Paddle (pagos, impuestos, facturas al cliente)
             ├──► Servidor (Supabase) ◄───┤      │ webhooks: alta, renovación, impago, baja
 AppClase  ──┘   base de datos + login     │      ▼
                 + funciones de servidor ◄─┘  (actualiza las suscripciones)
                        ▲
                        └── AdminApps (web, solo el propietario)
```

| Pieza | Tecnología | Motivo |
|---|---|---|
| Servidor | **Supabase**: Postgres, Auth (login), Edge Functions | Plan gratuito para empezar; login de usuarios ya resuelto |
| Pagos | **Paddle** (Merchant of Record) | Vende en todo el mundo y se encarga del IVA e impuestos de cada país |
| AdminApps | Web React + TypeScript (Vite) | Mismo stack que las apps; accesible desde el móvil |
| Cliente de licencias | Módulo TypeScript común, integrado en el proceso principal de Electron | El mismo código en FotoGestor y AppClase |
| Firma del instalador | Azure Trusted Signing (~10 $/mes) | Evita el aviso «Editor desconocido» de Windows |

### Repositorios propuestos
- `fotogestor` (existe).
- `appclase`: la app de estudiantes.
- `adminapps`: el proyecto de Supabase (tablas, funciones, webhooks) y la web de AdminApps.
- El módulo de licencias puede vivir en `adminapps` y copiarse en cada app, o publicarse como paquete
  npm privado más adelante.

## 5. Funcionamiento de la licencia

### 5.1 Cuenta y prueba
1. Al abrir la app por primera vez, el usuario crea una cuenta (email + contraseña, con verificación
   del email).
2. Empieza la prueba de 7 días automáticamente.
3. Solo hay **una prueba por cuenta y por ordenador** (para que no se encadenen pruebas con emails nuevos).
4. Al acabar, la app pasa a solo lectura y muestra el botón «Suscribirse», que abre el pago de Paddle
   con el email del usuario ya rellenado.

### 5.2 Comprobación al abrir la app
1. La app pide al servidor el estado de la licencia, enviando: app, versión, identificador del ordenador
   y la sesión del usuario.
2. El servidor responde con un **token firmado** (Ed25519) con caducidad corta (unas horas). Contiene:
   estado (`trial`, `active`, `past_due`, `cancelled`, `expired`), fecha de fin, funciones activadas,
   versión mínima obligatoria y avisos pendientes.
3. La app verifica la firma con la clave pública incluida en el instalador.
4. **Sin conexión al abrir → no se puede entrar** (pantalla «Conéctate a internet para continuar»).
5. Con la app abierta, se revalida cada hora. Si la conexión se pierde, la app **no se cierra** ni
   bloquea nada hasta que el usuario la cierre.
6. Si el servidor responde que la suscripción ya no es válida, la app pasa a solo lectura en ese momento.

### 5.3 Solo lectura
- Se bloquea en el **proceso principal** (las llamadas IPC de crear, editar, importar y borrar), no solo
  en la interfaz, para que no se salte desde la consola.
- Siempre se permite ver, buscar y **exportar** (copias de fotos, PDF de facturas, copia de la base de
  datos). Nunca se retienen los datos del usuario.

### 5.4 Dispositivos
- Identificador del ordenador: un valor aleatorio guardado por la app, combinado con el id de la
  máquina, guardado como hash.
- Máximo 2 equipos activos. Al activar un tercero, la app ofrece desactivar uno de los anteriores.
- Límite de cambios (por ejemplo, 3 al mes) para evitar que se comparta una cuenta entre muchas personas.
  Desde AdminApps se puede saltar el límite.

### 5.5 Pagos e impagos
- Paddle avisa al servidor por webhook de cada alta, renovación, cambio de plan, impago y baja.
- Si falla un cobro, Paddle reintenta durante unos días; mientras tanto el estado es `past_due` y la app
  **sigue funcionando** con un aviso para actualizar la tarjeta.
- Al cancelar, la suscripción sigue activa hasta el final del periodo pagado.
- El usuario gestiona su tarjeta y su cancelación desde el portal de cliente de Paddle (enlace en la app).

### 5.6 Disponibilidad del servidor
Como la app no abre sin conexión al servidor, **una caída del servidor deja sin servicio a todos los
usuarios**. Por eso:
- Antes del lanzamiento, pasar Supabase al plan Pro (25 $/mes): los proyectos gratuitos se pausan si
  no tienen actividad y no tienen copias de seguridad diarias.
- Si el servidor no responde por un error suyo (no por falta de internet del usuario) y la última
  validación es reciente, valorar dejar entrar al usuario con un aviso. **Decisión pendiente.**

## 6. AdminApps: módulos

| Módulo | Qué permite |
|---|---|
| Panel | Resumen: ingresos del mes, suscriptores activos, pruebas en curso, altas y bajas |
| Usuarios | Buscar por email; ver cuenta, suscripciones, equipos, historial y tickets |
| Suscripciones | Ver estado; regalar meses; ampliar la prueba; revocar; cambiar de plan |
| Dispositivos | Ver los equipos de cada usuario; desactivarlos; saltar el límite de cambios |
| Ventas | Ingresos recurrentes (MRR), altas, bajas, conversión de prueba a pago, ingresos por país |
| Cupones | Crear descuentos y precios de lanzamiento (se sincronizan con Paddle) |
| Versiones | Qué versión usa cada usuario; fijar una **versión mínima** que obliga a actualizar |
| Control remoto | Activar o desactivar funciones (por app, plan o usuario); modo mantenimiento |
| Avisos | Mensajes dentro de las apps: para todos, por app, por país, por estado o por usuario |
| Estadísticas | Uso de funciones y errores, anónimos y solo con consentimiento |
| Soporte | Mensajes enviados desde la app con datos técnicos (versión, sistema, registro de errores) |
| Auditoría | Registro de cada acción hecha desde AdminApps |

Acceso: una sola cuenta de administrador con verificación en dos pasos. Las operaciones de AdminApps
pasan por funciones del servidor; la clave de servicio de Supabase nunca llega al navegador.

## 7. Modelo de datos (resumen)

| Tabla | Contenido |
|---|---|
| `apps` | FotoGestor, AppClase |
| `plans` | Plan, app, periodo, precio e id del precio en Paddle |
| `profiles` | Usuario (ligado a Supabase Auth): email, país, idioma, fecha de alta |
| `subscriptions` | Usuario, app, plan, estado, fin del periodo, ids de Paddle |
| `trials` | Usuario, app, ordenador, inicio y fin |
| `devices` | Usuario, app, hash del ordenador, nombre, última conexión, versión, activo |
| `license_checks` | Registro de cada validación (para estadísticas y detectar abusos) |
| `feature_flags` | Función, app, ámbito (todos / plan / usuario), activada |
| `announcements` | Aviso, app, público al que va, fechas, prioridad |
| `app_versions` | Versión, app, fecha, versión mínima, notas |
| `telemetry_events` | Eventos de uso y errores anónimos |
| `support_tickets` | Usuario, app, mensaje, datos técnicos, estado, respuestas |
| `paddle_events` | Copia de cada webhook recibido (para depurar y no procesar dos veces) |
| `admin_audit_log` | Acciones hechas desde AdminApps |

Seguridad: Row Level Security en todas las tablas; cada usuario solo lee lo suyo y solo las funciones
del servidor escriben estados de suscripción.

## 8. Requisitos legales y comerciales

- **Términos de uso, política de privacidad y política de reembolsos** publicados en una web propia
  (Paddle los exige antes de aprobar la cuenta).
- **RGPD**: el servidor solo guarda datos de cuenta, licencia y estadísticas. La telemetría necesita
  consentimiento explícito.
- **AppClase y menores de edad**: en España, por debajo de 14 años hace falta consentimiento de los
  padres para tratar datos; el pago debe hacerlo un adulto. Hay que decidir la edad mínima.
- **Idiomas**: español e inglés como mínimo, por vender en todo el mundo.
- **FotoGestor fuera de España**: el módulo de facturas usa IVA e IRPF españoles; habrá que hacer los
  impuestos configurables para fotógrafos de otros países.

## 9. Fases

| Fase | Contenido | Resultado |
|---|---|---|
| 0 | Cuentas en Supabase y Paddle (sandbox), dominio y web con textos legales | Infraestructura lista |
| 1 | Tablas, login, prueba, comprobación de licencia, webhooks de Paddle; integración en FotoGestor; solo lectura | FotoGestor se puede vender |
| 2 | AdminApps básica: panel, usuarios, suscripciones, dispositivos, auditoría | Control de licencias |
| 3 | Versiones mínimas, control remoto, avisos, estadísticas, soporte, cupones, ventas | Control completo |
| 4 | Traducción al inglés, firma del instalador, lanzamiento | Venta en todo el mundo |
| 5 | AppClase con el mismo módulo de licencias | Segunda app a la venta |

## 10. Costes estimados

| Concepto | Al empezar | En producción |
|---|---|---|
| Supabase | 0 $ | 25 $/mes |
| Paddle | 0 $ fijo | ~5 % + 0,50 $ por cobro |
| Firma del instalador | — | ~10 $/mes |
| Dominio | ~12 €/año | ~12 €/año |
| AdminApps y web (Cloudflare Pages o similar) | 0 $ | 0 $ |

## 11. Pendiente de decidir

1. Si se deja entrar con aviso cuando el **servidor** falla (§5.6).
2. AppClase (aplazado): cómo se organizan los trabajos (asignaturas, cursos, fechas…) y edad mínima
   de los usuarios.
3. ¿Paquete con las dos apps a precio reducido?
4. Nombre comercial o titular que figurará como vendedor en Paddle (autónomo o empresa).
5. Qué hacer con los usuarios actuales de FotoGestor gratuito, si los hay.

---

## Apéndice A. Contrato entre las apps y el servidor

Implementado en la app (cliente) en `src/main/license/`. El servidor de pruebas
`scripts/license-mock.cjs` cumple este contrato y sirve de referencia para las funciones de Supabase.

Todas las peticiones son `POST` con JSON y llevan la cabecera `apikey: <clave publicable>`
(`sb_publishable_…`). Las que necesitan usuario llevan además `Authorization: Bearer <access_token>`;
la clave publicable nunca va en `Authorization`, porque no es un JWT.

### Cuentas (Supabase Auth, sin cambios)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `/auth/v1/signup` | `{ email, password }` | Sesión, o solo el usuario si hay que confirmar el email |
| `/auth/v1/token?grant_type=password` | `{ email, password }` | Sesión |
| `/auth/v1/token?grant_type=refresh_token` | `{ refresh_token }` | Sesión nueva |
| `/auth/v1/recover` | `{ email }` | `{}` |
| `/auth/v1/logout` | — | 204 |

Sesión: `{ access_token, refresh_token, expires_in, expires_at, user: { id, email } }`.

### `/functions/v1/license-check`

Cuerpo: `{ app, version, device_id, device_name, os }`.

| Respuesta | Significado | Qué hace la app |
|---|---|---|
| 200 `{ token, checkout_url, can_manage }` | Licencia emitida | Verifica el token y entra (completa o solo lectura) |
| 401 | Token de acceso caducado o no válido | Renueva la sesión y repite; si falla, pide iniciar sesión |
| 403 `{ error: "blocked", message }` | Cuenta suspendida | Muestra el mensaje y no deja entrar |
| 409 `{ error: "device_limit", max, devices: [{ id, name, last_seen }] }` | Más de `max` ordenadores | Pide desactivar uno |
| 5xx / sin respuesta | Servidor caído o sin internet | Al abrir: no deja entrar. Con la app abierta: sigue trabajando |

Al primer `license-check` de un usuario sin suscripción ni prueba previa en esa app y ese
ordenador, el servidor crea la prueba de 7 días.

`checkout_url`: página de pago (Paddle.js) con la app, el id de usuario y el email ya incluidos.
`can_manage`: el usuario tiene cliente en Paddle y puede abrir el portal (ver `portal-session`).

### Token de licencia

`base64url(JSON).base64url(firma)`, firmado con **Ed25519** sobre la primera parte tal cual.
La app lleva la clave pública (DER SPKI en base64) y rechaza tokens de otra app, otro ordenador,
otro usuario o caducados (margen de 5 minutos).

```json
{
  "v": 1, "app": "fotogestor", "sub": "<id usuario>", "email": "…", "device": "<device_id>",
  "status": "trial | active | past_due | cancelled | expired", "plan": "mensual | anual | null",
  "trial_end": "ISO 8601 | null", "period_end": "ISO 8601 | null",
  "features": [], "min_version": "0.17.0 | null", "iat": 1764150000, "exp": 1764171600
}
```

- `cancelled`: cancelada pero todavía dentro del periodo pagado; `expired`: ya terminada.
- Caducidad recomendada del token: 6 horas. La app vuelve a comprobar cada hora.

### `/functions/v1/portal-session`

Cuerpo: `{ app }`. Respuesta: `{ url }`, enlace de un solo uso al portal de cliente de Paddle
(cambiar tarjeta, cancelar). Se pide al pulsar «Gestionar suscripción» porque caduca enseguida.

### `/functions/v1/device-deactivate`

Cuerpo: `{ app, device_id }`. Respuestas: 200, 401 o 429 (`device_swap_limit`, demasiados cambios
de ordenador este mes).

## Apéndice B. Estado de la fase 1

Hecho en FotoGestor:
- Pantalla de acceso: crear cuenta (empieza la prueba), iniciar sesión, recuperar la contraseña.
- Comprobación al abrir y cada hora; sin conexión al abrir no deja entrar; si se pierde con la app
  abierta, se sigue trabajando.
- Modo solo lectura aplicado en el proceso principal a cada llamada IPC (ver
  `src/shared/license.ts`; una prueba unitaria obliga a clasificar cada llamada nueva).
- Límite de 2 ordenadores, versión mínima obligatoria, cuenta bloqueada.
- Avisos de prueba, pago pendiente, fin de la suscripción y solo lectura; apartado «Cuenta» en Ajustes.
- Sesión guardada cifrada con el almacén del sistema (DPAPI en Windows).
- Desactivado si la app se compila sin servidor configurado: la versión publicada no cambia.

Pendiente (necesita las cuentas de Supabase y Paddle y el repositorio `adminapps`):
- Tablas, Row Level Security y funciones `license-check` y `device-deactivate` en Supabase.
- Webhook de Paddle que actualiza las suscripciones.
- Generar el par de claves Ed25519 (la privada solo en Supabase) y compilar la app con la URL,
  la clave anon y la clave pública.
