const errorResponse = (description: string) => ({
    description,
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
        },
    },
});

export const swaggerSpec = {
    openapi: "3.0.3",
    info: {
        title: "NomaPay API",
        version: "1.0.0",
        description:
            "Billetera digital multi-moneda simulada. Documentación de los endpoints de autenticación, perfil de usuario y wallet.",
    },
    servers: [
        { url: "/api", description: "Servidor actual (relativo)" },
        { url: "http://localhost:3000/api", description: "Local" },
    ],
    tags: [
        { name: "Auth", description: "Registro, login, refresh, logout y login con Google" },
        { name: "Users", description: "Perfil del usuario autenticado" },
        { name: "Wallets", description: "Wallet y balances del usuario autenticado" },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "accessToken",
                description: "El access token se lee automáticamente de las cookies (no hace falta enviarlo manualmente desde el frontend).",
            },
        },
        schemas: {
            Error: {
                type: "object",
                properties: {
                    error: { type: "string", example: "Mensaje de error." },
                },
            },
            RegisterInput: {
                type: "object",
                required: ["name", "surname", "country", "email", "password"],
                properties: {
                    name: { type: "string", example: "Juan" },
                    surname: { type: "string", example: "Pérez" },
                    country: { type: "string", example: "AR" },
                    email: { type: "string", format: "email", example: "juan@nomapay.com" },
                    password: { type: "string", format: "password", example: "password123" },
                },
            },
            LoginInput: {
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: { type: "string", format: "email", example: "juan@nomapay.com" },
                    password: { type: "string", format: "password", example: "password123" },
                },
            },
            UserSummary: {
                type: "object",
                properties: {
                    id: { type: "integer", example: 1 },
                    name: { type: "string", example: "Juan" },
                    surname: { type: "string", example: "Pérez" },
                    email: { type: "string", example: "juan@nomapay.com" },
                    username: { type: "string", example: "juan.perez" },
                    alias: { type: "string", example: "juan.perez" },
                    cbu: { type: "string", nullable: true, example: "0000003100012345678901" },
                },
            },
            UserProfile: {
                type: "object",
                properties: {
                    id: { type: "integer", example: 1 },
                    name: { type: "string", example: "Juan" },
                    surname: { type: "string", example: "Pérez" },
                    email: { type: "string", example: "juan@nomapay.com" },
                    username: { type: "string", example: "juan.perez" },
                    alias: { type: "string", example: "juan.perez" },
                    cbu: { type: "string", nullable: true },
                    country: { type: "string", nullable: true, example: "AR" },
                    profilePictureUrl: { type: "string", nullable: true },
                },
            },
            UpdateProfileInput: {
                type: "object",
                description: "Solo se puede modificar country, username y/o alias. email, cbu, documentType y documentNumber son inmutables.",
                properties: {
                    country: { type: "string", example: "AR" },
                    username: { type: "string", example: "nuevo.username" },
                    alias: { type: "string", example: "nuevo.alias" },
                },
            },

            BalanceDetail: {
                type: "object",
                properties: {
                    currencyCode: { type: "string", example: "USD" },
                    currencyName: { type: "string", example: "Dólar estadounidense" },
                    symbol: { type: "string", nullable: true, example: "$" },
                    amount: { type: "string", example: "0" },
                },
            },
            WalletSummary: {
                type: "object",
                properties: {
                    walletId: { type: "integer", example: 1 },
                    preferredCurrency: { type: "string", example: "USD" },
                    balances: {
                        type: "array",
                        items: { $ref: "#/components/schemas/BalanceDetail" },
                    },
                },
            },
            ExchangeInput: {
                type: "object",
                required: ["fromCurrency", "toCurrency", "amount"],
                properties: {
                    fromCurrency: { type: "string", example: "ARS" },
                    toCurrency: { type: "string", example: "USD" },
                    amount: { type: "number", example: 10000, description: "Monto en la moneda de origen (fromCurrency)." },
                },
            },
            TransactionDetail: {
                type: "object",
                properties: {
                    id: { type: "integer", example: 4 },
                    type: { type: "string", enum: ["buy", "sell", "transfer", "exchange"], example: "exchange" },
                    status: { type: "string", example: "completed" },
                    currencyOrigin: { type: "string", example: "ARS" },
                    currencyDestination: { type: "string", example: "USD" },
                    amount: { type: "string", example: "10000.00000000", description: "Monto original en la moneda de origen." },
                    fee: { type: "string", example: "50.00000000", description: "Comisión cobrada en la moneda de origen." },
                    finalAmount: { type: "string", example: "6.63", description: "Monto acreditado en la moneda de destino." },
                    exchangeRate: { type: "string", example: "1508.21110000", description: "Cuántas unidades de currencyOrigin equivalen a 1 unidad de currencyDestination." },
                    transactionDate: { type: "string", format: "date-time", example: "2026-09-04T01:48:13.004Z" },
                },
            },
            ExchangeResult: {
                type: "object",
                properties: {
                    transaction: { $ref: "#/components/schemas/TransactionDetail" },
                    wallet: { $ref: "#/components/schemas/WalletSummary" },
                },
            },
            ExchangeRatesResult: {
                type: "object",
                properties: {
                    base: { type: "string", example: "ARS" },
                    rates: {
                        type: "object",
                        additionalProperties: { type: "number" },
                        example: { USD: 0.000663, BRL: 0.003378 },
                        description: "Cuántas unidades de la moneda base equivalen a 1 unidad de cada moneda listada.",
                    },
                    fetchedAt: { type: "string", format: "date-time", example: "2026-09-04T01:45:56.806Z" },
                },
            },
        },
    },
    paths: {
        "/auth/register": {
            post: {
                tags: ["Auth"],
                summary: "Crear una cuenta nueva",
                description: "Crea el usuario, su wallet y las balances iniciales (en 0) para cada moneda activa.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterInput" } } },
                },
                responses: {
                    "201": {
                        description: "Usuario creado",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } },
                    },
                    "400": errorResponse("Datos inválidos"),
                    "409": errorResponse("Ya existe una cuenta con ese email"),
                },
            },
        },
        "/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "Iniciar sesión",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/LoginInput" } } },
                },
                responses: {
                    "200": {
                        description: "Login exitoso",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } },
                    },
                    "400": errorResponse("Email o contraseña incorrectos"),
                },
            },
        },
        "/auth/refresh": {
            post: {
                tags: ["Auth"],
                summary: "Renovar el access token",
                description: "Usa el refreshToken vigente de la cookie para setear un par de tokens nuevo (rotación).",
                responses: {
                    "200": {
                        description: "Tokens renovados correctamente",
                        content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } },
                    },
                    "400": errorResponse("Falta el refreshToken en las cookies"),
                },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"],
                summary: "Cerrar sesión",
                description: "Revoca el refreshToken enviado para que no se pueda volver a usar.",
                responses: {
                    "200": { description: "Sesión cerrada correctamente" },
                    "400": errorResponse("Falta el refreshToken"),
                },
            },
        },
        "/auth/google/register": {
            post: {
                tags: ["Auth"],
                summary: "Registrarse con Google",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["idToken"],
                                properties: { idToken: { type: "string", description: "ID token entregado por Google Sign-In." } },
                            },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Usuario creado con Google",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } },
                    },
                    "400": errorResponse("Falta el idToken de Google"),
                },
            },
        },
        "/auth/google/login": {
            post: {
                tags: ["Auth"],
                summary: "Iniciar sesión con Google",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["idToken"],
                                properties: { idToken: { type: "string" } },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Login con Google exitoso",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } },
                    },
                    "400": errorResponse("Falta el idToken de Google"),
                },
            },
        },
        "/users/me": {
            get: {
                tags: ["Users"],
                summary: "Obtener el perfil del usuario autenticado",
                security: [{ cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Perfil del usuario",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                    },
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Usuario no encontrado"),
                },
            },
            patch: {
                tags: ["Users"],
                summary: "Actualizar el perfil del usuario autenticado",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateProfileInput" } } },
                },
                responses: {
                    "200": {
                        description: "Perfil actualizado",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                    },
                    "400": errorResponse("Intentaste modificar un campo inmutable, o el username está en cooldown"),
                    "401": errorResponse("No autenticado"),
                    "409": errorResponse("Ese username o alias ya está en uso"),
                },
            },
        },
        "/users/me/password": {
            patch: {
                tags: ["Users"],
                summary: "Cambiar la contraseña",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["currentPassword", "newPassword"],
                                properties: {
                                    currentPassword: { type: "string", format: "password" },
                                    newPassword: { type: "string", format: "password" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": { description: "Contraseña actualizada correctamente" },
                    "400": errorResponse("Faltan currentPassword o newPassword"),
                    "401": errorResponse("No autenticado, o currentPassword incorrecta"),
                },
            },
        },
        "/wallets/me": {
            get: {
                tags: ["Wallets"],
                summary: "Obtener la wallet y balances del usuario autenticado",
                security: [{ cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Wallet del usuario",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/WalletSummary" } } },
                    },
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Este usuario no tiene una wallet asociada"),
                },
            },
        },
        "/wallets/me/preferred-currency": {
            patch: {
                tags: ["Wallets"],
                summary: "Cambiar la moneda preferida de la wallet",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["preferredCurrency"],
                                properties: { preferredCurrency: { type: "string", example: "EUR" } },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Moneda preferida actualizada",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/WalletSummary" } } },
                    },
                    "400": errorResponse("Falta preferredCurrency, o la moneda no está disponible"),
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Este usuario no tiene una wallet asociada"),
                },
            },
        },
        "/wallets/me/exchange": {
            post: {
                tags: ["Wallets"],
                summary: "Intercambiar monedas",
                description:
                    "Convierte un monto de fromCurrency a toCurrency dentro de la misma wallet, usando la tasa de cambio actual (con caché). Se cobra una comisión (TRANSACTION_FEE_PERCENTAGE) sobre el monto de origen. El usuario elige libremente ambas monedas. Al completarse, se envía un email de confirmación vía AWS SES.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/ExchangeInput" } } },
                },
                responses: {
                    "201": {
                        description: "Operación completada: balances actualizados y transacción registrada",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/ExchangeResult" } } },
                    },
                    "400": errorResponse("Datos inválidos: monto <= 0, misma moneda en origen/destino, moneda inactiva, o saldo insuficiente"),
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Wallet o balance de origen inexistente"),
                    "502": errorResponse("No se pudo obtener la tasa de cambio desde la API externa"),
                },
            },
        },
        "/wallets/me/exchange-rates": {
            get: {
                tags: ["Wallets"],
                summary: "Consultar tasas de cambio actuales",
                description: "Devuelve las tasas de cambio de las monedas activas contra una moneda base, usando caché en memoria con TTL configurable (EXCHANGE_RATE_CACHE_TTL_MS).",
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: "base",
                        in: "query",
                        required: false,
                        schema: { type: "string", example: "ARS" },
                        description: "Moneda base contra la que se expresan las tasas. Por defecto, LOCAL_CURRENCY (ARS).",
                    },
                ],
                responses: {
                    "200": {
                        description: "Tasas de cambio actuales",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/ExchangeRatesResult" } } },
                    },
                    "401": errorResponse("No autenticado"),
                    "502": errorResponse("No se pudo obtener la tasa de cambio desde la API externa"),
                },
            },
        },
    },
};