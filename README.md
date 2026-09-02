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
| Autenticación | JWT en Cookies HttpOnly |
| Hash de contraseñas | bcrypt |
| Login social | Google OAuth (`google-auth-library`) |
| Documentación de API | Swagger / OpenAPI 3.0 (`swagger-ui-express`) |
| Despliegue | Railway (API + PostgreSQL) |

---

## Estructura del proyecto

```text
src/
  controllers/    # recibe el request, valida el input mínimo y llama al service correspondiente
  services/       # lógica de negocio: acá vive el "qué hace" cada operación
  models/         # definición de las tablas con Sequelize
  routes/         # mapeo de endpoints a controllers
  middlewares/    # auth (verificación de JWT), validación de inputs
  errors/         # clases de error propias (AppError, ValidationError, ConflictError, NotFoundError)
  mails/          # (placeholder) envío de emails — ver Roadmap
  api-calls/      # (placeholder) integraciones externas (tasas de cambio) — ver Roadmap
  helpers/        # utilidades varias
  swagger.ts      # especificación completa de la API
db/
  schema.sql      # estructura completa de la base de datos
  migrations/     # cambios incrementales sobre schema.sql (ver más abajo)
  seed.sql        # datos de prueba
```

La separación en capas (`controller → service → model`) busca que cada archivo tenga una sola responsabilidad: el controller no sabe *cómo* se registra un usuario, solo que tiene que llamar a `registerUser()` y devolver lo que le devuelvan; toda la lógica (crear wallet, crear balances iniciales, hashear password) vive en el service, que es donde realmente hay que mirar para entender el negocio.

---

## Modelo de datos

```text
users (1) ──── (1) wallets (1) ──── (N) balances ──── (1) currencies
│
└──── (N) transactions
users (1) ──── (N) refresh_tokens
users (1) ──── (1) subscriptions
```

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

Estrategia: **JWT almacenados en Cookies `HttpOnly` Seguras.**

- **Registro / Login** (`/auth/register`, `/auth/login`): El backend configura automáticamente dos cookies invisibles para JavaScript (`accessToken` y `refreshToken`) en el navegador. La respuesta JSON solo devuelve los datos públicos del usuario.
- **Refresh** (`/auth/refresh`): Lee automáticamente el `refreshToken` desde la cookie del navegador para pedir un par nuevo de tokens (rotación de refresh token).
- **Logout** (`/auth/logout`): Revoca el `refreshToken` en la base de datos y le indica al navegador que borre las cookies, cerrando la sesión efectivamente.
- **Protección de rutas**: El middleware `requireAuth` lee automáticamente la cookie `accessToken` en cada request a una ruta protegida (`/users/me`, `/wallets/me`, etc.). Ya no es necesario enviar el header `Authorization: Bearer <token>` desde el frontend.
- **Seguridad de contraseñas**: Se hashean con `bcrypt` antes de guardarse; nunca se guarda ni se devuelve la contraseña en texto plano.
- **Login con Google**: Implementado con `google-auth-library`. Genera y setea las mismas cookies seguras que el login tradicional.

---

## Instalación y setup local

### 1. Clonar e instalar

```bash
git clone https://github.com/nomapayapp-collab/NomaPay_backend.git
cd NomaPay_backend
npm install
```

### 2. Configurar el `.env`

Ver la sección [Variables de entorno](#variables-de-entorno).

### 3. Crear la base de datos y cargar el esquema

**Importante:** hay que correr `schema.sql` **y todas las migraciones**, en orden — no alcanza con el schema solo.

```bash
createdb nomapay
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrations/0001_add_google_auth.sql
psql $DATABASE_URL -f db/migrations/0002_add_refresh_tokens.sql
psql $DATABASE_URL -f db/migrations/0003_fix_nullable_columns.sql
psql $DATABASE_URL -f db/seed.sql   # opcional: carga datos de prueba
```

*(Si no tenés `psql` en el PATH de Windows, se puede correr el contenido de cada archivo desde una extensión de base de datos de tu editor — la lógica es la misma: correr `schema.sql` primero, después cada migración en orden numérico.)*

### 4. Levantar el servidor

```bash
npm run dev
```

Con esto arriba, entrá a `http://localhost:3000/api-docs` para ver y probar todos los endpoints desde el navegador.

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string de PostgreSQL |
| `JWT_SECRET` | Sí | Clave para firmar los access tokens |
| `JWT_EXPIRES_IN` | Sí | Duración del access token (ej. `7d`) |
| `PORT` | No (default 3000) | Puerto del servidor |
| `NODE_ENV` | No | En `production` activa SSL en la conexión a Postgres y flags seguras en las cookies |
| `GOOGLE_CLIENT_ID` | No | Necesaria solo para que funcione el login con Google |
| `CORS_ORIGINS` | Sí | Lista de dominios permitidos (ej. URL de Vercel) |

---

## Endpoints disponibles

Documentados en detalle en `/api-docs`. Resumen:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | No | Crea cuenta, wallet y balances iniciales |
| POST | `/api/auth/login` | No | Login, setea cookies seguras `HttpOnly` con los tokens |
| POST | `/api/auth/refresh` | No | Renueva los tokens (leyendo automáticamente la cookie) |
| POST | `/api/auth/logout` | No | Revoca el token en BD y limpia las cookies del navegador |
| POST | `/api/auth/google/register` | No | Registro con Google |
| POST | `/api/auth/google/login` | No | Login con Google, setea cookies seguras |
| GET | `/api/users/me` | Sí | Perfil del usuario autenticado |
| PATCH | `/api/users/me` | Sí | Actualiza country/username/alias |
| PATCH | `/api/users/me/password` | Sí | Cambia la contraseña |
| GET | `/api/wallets/me` | Sí | Wallet y balances del usuario |
| PATCH | `/api/wallets/me/preferred-currency` | Sí | Cambia la moneda preferida |

---

## Despliegue

- **Backend + PostgreSQL**: Railway. El servicio usa `DATABASE_URL` (inyectada automáticamente por el plugin de Postgres de Railway) y `NODE_ENV=production` para activar SSL en la conexión a la base y la flag `Secure` de las cookies.
- **Frontend**: Vercel, apuntando al backend de Railway mediante la variable `VITE_API_URL`.

---

## Decisiones de diseño

**¿Por qué `balances` es una tabla separada, y no columnas en `wallets`?**
Porque un usuario maneja **varias monedas a la vez**. Si el saldo de cada moneda fuera una columna (`saldo_usd`, `saldo_brl`, `saldo_ars`...), agregar una moneda nueva al sistema requeriría una migración de base de datos cada vez. Con `balances` como tabla aparte (una fila por wallet + moneda), agregar una moneda nueva es simplemente insertar una fila en `currencies` — el modelo escala sin tocar el esquema.

**¿Por qué `wallets` es 1 a 1 con `users`, en vez de guardar todo directamente en `users`?**
Para mantener separados los datos de identidad (nombre, email, documento) de los datos financieros (moneda preferida, balances). Esto también deja la puerta abierta a que en el futuro un usuario pueda tener más de una wallet sin tener que rediseñar la tabla `users`.

**¿Por qué `transactions` guarda `currency_origin`, `currency_destination`, `exchange_rate` y `fee` desde el diseño inicial, si compra/venta/intercambio todavía no están implementados?**
Porque diseñar el modelo de datos pensando en el flujo completo evita tener que hacer una migración disruptiva más adelante. Aunque la lógica de negocio (Sprint 2) todavía no escribe en estos campos, la tabla ya está preparada para representar cualquiera de las cuatro operaciones (`buy`, `sell`, `exchange`, `transfer`) sin cambios de esquema.

**¿Por qué JWT almacenado en Cookies en vez de LocalStorage?**
JWT es *stateless*: el backend no necesita guardar sesiones en memoria para validar cada request, lo cual es más simple de escalar. Migrar el almacenamiento de los tokens desde el `LocalStorage` (donde son vulnerables a scripts maliciosos XSS) a cookies `HttpOnly` asegura que el navegador gestione la sesión de manera segura, aislando los tokens del acceso mediante JavaScript.

---

## Roadmap / Sprint 2

Lo que sigue **no está implementado todavía** — se deja documentado para que el estado del proyecto sea siempre honesto y verificable:

- [ ] Operaciones de compra, venta e intercambio entre monedas
- [ ] Integración con API de tasas de cambio (Frankfurter / ExchangeRate-API / Currency Freaks) con caching
- [ ] Envío de emails de confirmación por transacción (AWS SES)
- [ ] Suite de tests con Vitest sobre la lógica crítica (cálculo de balances, validación de transacciones, conversión de moneda)
- [ ] Lógica y endpoints de suscripciones (tabla ya preparada en el modelo de datos)

El modelo de datos y la infraestructura de auth ya están preparados para soportar todo esto sin cambios estructurales grandes.
