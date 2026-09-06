 ### NomaPay — Backend

Backend de **NomaPay**, una billetera digital multi-moneda simulada (sin dinero real). Expone la API REST que consume el frontend en React: autenticación, perfil de usuario y wallet.

> 🔗 **Documentación interactiva de la API (Swagger):** `/api-docs` 

- En local (`http://localhost:3000/api-docs`) (con el servidor corriendo)

- En producción (`https://nomapaybackend-production.up.railway.app/api-docs/#/`).

> 🚀 **API en producción (Railway):** `https://nomapaybackend-production.up.railway.app`

---

## Índice

- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Modelo de datos](#modelo-de-datos)
- [Autenticación](#autenticación)
- [Instalación y setup local](#instalación-y-setup-local)
- [Variables de entorno](#variables-de-entorno)
- [Endpoints disponibles](#endpoints-disponibles)
- [Despliegue](#despliegue)
- [Decisiones de diseño](#decisiones-de-diseño)
- [Roadmap / Sprint 2](#roadmap--sprint-2)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework HTTP | Express |
| Base de datos | PostgreSQL |
| ORM | Sequelize |
| Autenticación | JWT (access + refresh token) |
| Hash de contraseñas | bcrypt |
| Login social | Google OAuth (`google-auth-library`) |
| Documentación de API | Swagger / OpenAPI 3.0 (`swagger-ui-express`) |
| Despliegue | Railway (API + PostgreSQL) |

---

## Estructura del proyecto

src/
controllers/ # recibe el request, valida el input mínimo y llama al service correspondiente
services/ # lógica de negocio: acá vive el "qué hace" cada operación
models/ # definición de las tablas con Sequelize
routes/ # mapeo de endpoints a controllers
middlewares/ # auth (verificación de JWT), validación de inputs
errors/ # clases de error propias (AppError, ValidationError, ConflictError, NotFoundError)
mails/ # envío de emails de confirmación de transacciones vía AWS SES
api-calls/ # helper genérico de fetch con timeout, usado por las integraciones externas (tasas de cambio)
helpers/ # utilidades varias
swagger.ts # especificación completa de la API
db/
schema.sql # estructura completa de la base de datos
migrations/ # cambios incrementales sobre schema.sql (ver más abajo)
seed.sql # datos de prueba


La separación en capas (`controller → service → model`) busca que cada archivo tenga una sola responsabilidad: el controller no sabe *cómo* se registra un usuario, solo que tiene que llamar a `registerUser()` y devolver lo que le devuelvan; toda la lógica (crear wallet, crear balances iniciales, hashear password) vive en el service, que es donde realmente hay que mirar para entender el negocio.

---

## Modelo de datos

users (1) ──── (1) wallets (1) ──── (N) balances ──── (1) currencies
│
└──── (N) transactions
users (1) ──── (N) refresh_tokens
users (1) ──── (1) subscriptions


Tablas principales: users, wallets, balances, transactions, más currencies (catálogo de monedas soportadas), refresh_tokens (sesiones activas) y subscriptions (suscripción del usuario a un plan).

 * users: datos de la cuenta (nombre, email, password hasheada, username/alias/CBU autogenerados, y campos opcionales para verificación de identidad y recuperación de contraseña que todavía no se usan activamente).
 
 * wallets: cada usuario tiene una wallet (relación 1 a 1), que guarda su moneda preferida.
 * balances: el saldo de esa wallet por cada moneda — una fila por combinación wallet/moneda.
 * transactions: historial de movimientos, ya preparado para buy / sell / exchange / transfer, con moneda de origen, moneda de destino, tasa de cambio aplicada y fee.
 * currencies: catálogo de monedas activas (código, nombre, símbolo), para no hardcodear las monedas soportadas en el código.
 * subscriptions: la suscripción del usuario a un plan (por ahora solo premium), con estado (active / cancelled / expired) y fechas de inicio y vencimiento. Relación 1 a 1 con users — la tabla y el modelo ya están armados, pero todavía no hay ningún endpoint ni lógica de negocio construida encima (ver Roadmap).

### Constraints, foreign keys e índices

* users.email, users.username, users.alias y users.cbu son UNIQUE.
* wallets.user_id referencia a users(id) con ON DELETE CASCADE (si se borra un usuario, se borra su wallet).
* balances.wallet_id y balances.currency_code tienen un UNIQUE compuesto: una wallet no puede tener dos filas de balance para la misma moneda.
* transactions tiene CHECK constraints sobre type (solo acepta buy/sell/exchange/transfer) y sobre montos (no se permiten negativos).
* Índice sobre transactions(wallet_id, created_at) para que el historial de movimientos de una wallet se pueda traer ordenado por fecha sin escanear toda la tabla.
* refresh_tokens.token_hash es UNIQUE, y tiene índice sobre user_id para poder revocar todas las sesiones de un usuario rápido.
* subscriptions.user_id referencia a users(id) con ON DELETE CASCADE, y tiene un UNIQUE que garantiza una sola suscripción por usuario.

---

## Autenticación

Estrategia: **JWT con par access/refresh token.**

- **Registro / Login** (`/auth/register`, `/auth/login`) devuelven un `accessToken` (corta duración, se manda en cada request) y un `refreshToken` (larga duración, se guarda para renovar la sesión sin volver a pedir contraseña).
- **Refresh** (`/auth/refresh`): usa el `refreshToken` para pedir un par nuevo. El refresh token usado se invalida (rotación), así que un token robado no sirve dos veces.
- **Logout** (`/auth/logout`): revoca el `refreshToken` en la base de datos — a partir de ahí ya no se puede usar para pedir un accessToken nuevo.
- **Protección de rutas**: el middleware `requireAuth` valida el `Authorization: Bearer <accessToken>` en cada request a una ruta protegida (`/users/me`, `/wallets/me`, etc.) y rechaza con `401` si falta o es inválido.
- **Seguridad de contraseñas**: se hashean con `bcrypt` antes de guardarse; nunca se guarda ni se devuelve la contraseña en texto plano.
- **Login con Google**: implementado con `google-auth-library`. Si la variable `GOOGLE_CLIENT_ID` no está configurada, ese endpoint puntual devuelve `503` explicando qué falta, pero **no afecta al resto de la API** (login/registro normal siguen funcionando igual).

---

## Instalación y setup local

### 1. Clonar e instalar

git clone https://github.com/nomapayapp-collab/NomaPay_backend.git
cd NomaPay_backend
npm install


### 2. Configurar el `.env`

Ver la sección [Variables de entorno](#variables-de-entorno).

### 3. Crear la base de datos y cargar el esquema

**Importante:** hay que correr `schema.sql` **y todas las migraciones**, en orden — no alcanza con el schema solo.

createdb nomapay
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrations/0001_add_google_auth.sql
psql $DATABASE_URL -f db/migrations/0002_add_refresh_tokens.sql
psql $DATABASE_URL -f db/migrations/0003_fix_nullable_columns.sql
psql $DATABASE_URL -f db/migrations/0004_change_deposit.sql
psql $DATABASE_URL -f db/seed.sql # opcional: carga datos de prueba


*(Si no tenés `psql` en el PATH de Windows, se puede correr el contenido de cada archivo desde una extensión de base de datos de tu editor — la lógica es la misma: correr `schema.sql` primero, después cada migración en orden numérico.)*

### 4. Levantar el servidor

npm run dev


Con esto arriba, entrá a `http://localhost:3000/api-docs` para ver y probar todos los endpoints desde el navegador.

---

## Variables de entorno

> ⚠️ **Importante:** la conexión a PostgreSQL se arma con **`DATABASE_URL` directamente** (`src/db.ts`) — no con variables sueltas tipo `DB_USER`/`DB_HOST`/etc. Un `.env` local que solo tenga esas variables sueltas y no `DATABASE_URL` va a fallar al conectar. Formato: `postgresql://usuario:password@localhost:5432/nomapay`.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string completo de PostgreSQL (ver formato arriba) |
| `JWT_SECRET` | Sí | Clave para firmar los access tokens |
| `PORT` | No (default `3000`) | Puerto del servidor |
| `NODE_ENV` | No | En `production` activa SSL en la conexión a Postgres |
| `CORS_ORIGINS` | No (default: ninguno permitido) | Lista de dominios permitidos, separados por coma |
| `ACCESS_TOKEN_EXPIRES_IN` | No (default `30m`) | Duración del access token |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | No (default `30`) | Duración del refresh token, en días |
| `GOOGLE_CLIENT_ID` | No | Necesaria solo para que funcione el login con Google (init perezoso: si falta, ese endpoint puntual devuelve `503` y el resto de la API sigue funcionando) |
| `LOCAL_CURRENCY` | No (default `ARS`) | Moneda base usada en compra/venta/exchange y en `/wallets/me/exchange-rates` |
| `TRANSACTION_FEE_PERCENTAGE` | No | Comisión cobrada en cada exchange, sobre el monto de origen |
| `EXCHANGE_RATE_API_BASE_URL` | No | Proveedor primario de tasas de cambio (ExchangeRate-API) |
| `FALLBACK_EXCHANGE_RATE_API_BASE_URL` | No | Proveedor de respaldo (fawazahmed0/currency-api vía jsDelivr), usado si el primario falla |
| `EXCHANGE_RATE_CACHE_TTL_MS` | No | TTL del caché en memoria de tasas de cambio |
| `MAX_DEPOSIT_USD` | No (default `10000`) | Monto máximo por carga en USD (`/wallets/deposit`) |
| `MAX_DEPOSIT_ARS` | No (default `50000000`) | Monto máximo por carga en ARS |
| `MAX_DEPOSIT_BRL` | No (default `1000000`) | Monto máximo por carga en BRL |
| `MAX_DEPOSIT_AMOUNT` | No (default `1000000`) | Límite de respaldo para cualquier moneda sin límite propio configurado arriba |
| `SES_ENABLED` | No (default `true`) | En `false`, solo loguea el email en consola en vez de mandarlo de verdad (útil en local/tests) |
| `SES_SOURCE_EMAIL` | Sí, si `SES_ENABLED=true` | Dirección remitente verificada en AWS SES |
| `AWS_REGION` | No (default `us-east-1`) | Región de AWS para el cliente de SES |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Sí, si `SES_ENABLED=true` | Credenciales de AWS (las lee el SDK directamente del entorno) |
| `GEMINI_API_KEY` | No | Necesaria para el chatbot (init perezoso: si falta, `/chatbot/message` devuelve `503` sin afectar al resto de la API) |
| `GEMINI_MODEL` | No (default `gemini-3.1-flash-lite`) | Modelo de Gemini usado por el chatbot |

---

## Endpoints disponibles

Documentados en detalle en `/api-docs`. Resumen:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | No | Crea cuenta, wallet y balances iniciales |
| POST | `/api/auth/login` | No | Login, devuelve accessToken + refreshToken |
| POST | `/api/auth/refresh` | No | Renueva el par de tokens (rotación) |
| POST | `/api/auth/logout` | No | Revoca el refreshToken |
| POST | `/api/auth/google/register` | No | Registro con Google |
| POST | `/api/auth/google/login` | No | Login con Google |
| GET | `/api/users/me` | Sí | Perfil del usuario autenticado |
| PATCH | `/api/users/me` | Sí | Actualiza country/username/alias |
| PATCH | `/api/users/me/password` | Sí | Cambia la contraseña |
| GET | `/api/wallets/me` | Sí | Wallet y balances del usuario |
| PATCH | `/api/wallets/me/preferred-currency` | Sí | Cambia la moneda preferida |
| POST | `/api/wallets/me/exchange` | Sí | Compra/venta/intercambio entre dos monedas, con tasa real y comisión. Envía email de confirmación por SES |
| GET | `/api/wallets/me/exchange-rates` | Sí | Tasas de cambio actuales de las monedas activas contra una moneda base (caché con TTL) |
| POST | `/api/wallets/deposit` | Sí | Carga dinero simulado directo a una moneda, sin conversión ni comisión. Límite máximo por moneda (ver [Variables de entorno](#variables-de-entorno)) |
| POST | `/api/transfers` | Sí | Transfiere saldo a otro usuario por alias o CBU, sin comisión |
| POST | `/api/chatbot/message` | Sí | Asistente conversacional (Gemini) con contexto de NomaPay, sin acceso a datos reales del usuario |

---

## Despliegue

- **Backend + PostgreSQL**: Railway. El servicio usa `DATABASE_URL` (inyectada automáticamente por el plugin de Postgres de Railway) y `NODE_ENV=production` para activar SSL en la conexión a la base.
- **Frontend**: Vercel, apuntando al backend de Railway mediante la variable `VITE_API_URL`.

---

## Decisiones de diseño

**¿Por qué `balances` es una tabla separada, y no columnas en `wallets`?**
Porque un usuario maneja **varias monedas a la vez**. Si el saldo de cada moneda fuera una columna (`saldo_usd`, `saldo_brl`, `saldo_ars`...), agregar una moneda nueva al sistema requeriría una migración de base de datos cada vez. Con `balances` como tabla aparte (una fila por wallet + moneda), agregar una moneda nueva es simplemente insertar una fila en `currencies` — el modelo escala sin tocar el esquema.

**¿Por qué `wallets` es 1 a 1 con `users`, en vez de guardar todo directamente en `users`?**
Para mantener separados los datos de identidad (nombre, email, documento) de los datos financieros (moneda preferida, balances). Esto también deja la puerta abierta a que en el futuro un usuario pueda tener más de una wallet sin tener que rediseñar la tabla `users`.

**¿Por qué `transactions` guarda `currency_origin`, `currency_destination`, `exchange_rate` y `fee` desde el diseño inicial, si compra/venta/intercambio todavía no están implementados?**
Porque diseñar el modelo de datos pensando en el flujo completo evita tener que hacer una migración disruptiva más adelante. Aunque la lógica de negocio (Sprint 2) todavía no escribe en estos campos, la tabla ya está preparada para representar cualquiera de las cuatro operaciones (`buy`, `sell`, `exchange`, `transfer`) sin cambios de esquema.

**¿Por qué el límite máximo de depósito es por moneda, y no un solo número global?**
Porque un mismo monto no significa lo mismo en distintas monedas: 50.000.000 es un tope razonable en ARS pero sería absurdo en USD. Cada límite (`MAX_DEPOSIT_USD`, `MAX_DEPOSIT_ARS`, `MAX_DEPOSIT_BRL`) se puede pisar por variable de entorno de forma independiente; una moneda nueva que todavía no tenga su propio límite configurado cae en `MAX_DEPOSIT_AMOUNT` como respaldo, en vez de quedar sin tope.

**¿Por qué JWT con access + refresh token, en vez de sessions?**
JWT es *stateless*: el backend no necesita guardar sesiones en memoria ni en la base para validar cada request, lo cual es más simple de escalar y encaja naturalmente con un frontend separado (React) que consume la API desde otro dominio. El refresh token con rotación agrega una capa de seguridad: si un access token se filtra, expira rápido; si un refresh token se filtra, se puede revocar por `logout`.

---

## Roadmap / Sprint 2

Estado real verificado contra el código (no contra lo planeado originalmente), para que este documento siga siendo honesto y verificable:

- [x] Operaciones de compra, venta e intercambio entre monedas — unificadas en un solo endpoint (`POST /wallets/me/exchange`), con comisión configurable y transacciones con lock para evitar condiciones de carrera
- [x] Integración con API de tasas de cambio, con caching — dos proveedores (ExchangeRate-API como primario, fawazahmed0/currency-api como fallback), caché en memoria con TTL y fallback a caché vencido si ambos proveedores fallan
- [x] Envío de emails de confirmación por transacción (AWS SES) — activo en `/wallets/me/exchange` (se dispara después del commit, para que un fallo de email nunca revierta la operación financiera). **No** está activo en `/wallets/deposit` (el bloque de envío está comentado en `deposit.service.ts`)
- [x] Carga de saldo simulado (`POST /wallets/deposit`), con límite máximo configurable por moneda
- [x] Transferencias entre usuarios por alias o CBU (`POST /transfers`)
- [x] Asistente conversacional (Gemini) en `POST /chatbot/message`, con filtro de prompt injection y sin acceso a datos reales de usuarios
- [x] Suite de tests con Vitest sobre la lógica crítica — cubre auth, wallet-operations (exchange), deposit, transfer, exchange-rate y chatbot (`tests/*.test.ts`)
- [ ] Lógica y endpoints de suscripciones (la tabla `subscriptions` ya existe en el modelo de datos, pero todavía no hay ningún controller, route ni service construido encima)

El modelo de datos y la infraestructura de auth ya estaban preparados desde el diseño inicial para soportar todo esto sin cambios estructurales grandes — y así fue: ninguna de estas features requirió tocar el esquema de `transactions`, `balances` ni `wallets`.
