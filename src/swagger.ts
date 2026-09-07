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
        { name: "Transfers", description: "Transferencias entre usuarios por alias o CBU" },
        { name: "Chatbot", description: "Asistente conversacional de soporte (Gemini)" },
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
                    theme: { type: "string", enum: ["light", "dark"], example: "light" },
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
                    type: { type: "string", enum: ["exchange"], example: "exchange", description: "El endpoint /wallets/me/exchange siempre crea transacciones de tipo 'exchange'." },
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
            DepositInput: {
                type: "object",
                required: ["currencyCode", "amount"],
                properties: {
                    currencyCode: { type: "string", example: "ARS" },
                    amount: { type: "number", example: 5000, description: "Monto a acreditar (dinero simulado, no hay conversión ni comisión)." },
                },
            },
            DepositTransactionDetail: {
                type: "object",
                properties: {
                    id: { type: "integer", example: 12 },
                    type: { type: "string", enum: ["deposit"], example: "deposit" },
                    status: { type: "string", example: "completed" },
                    currencyCode: { type: "string", example: "ARS" },
                    amount: { type: "string", example: "5000" },
                    transactionDate: { type: "string", format: "date-time", example: "2026-09-05T14:02:11.000Z" },
                },
            },
            DepositResult: {
                type: "object",
                properties: {
                    transaction: { $ref: "#/components/schemas/DepositTransactionDetail" },
                    wallet: { $ref: "#/components/schemas/WalletSummary" },
                },
            },
            TransferInput: {
                type: "object",
                required: ["aliasOrCbu", "currencyCode", "amount"],
                properties: {
                    aliasOrCbu: { type: "string", description: "Alias o CBU del usuario destino.", example: "juan.perez" },
                    currencyCode: { type: "string", example: "ARS" },
                    amount: { type: "number", example: 2500 },
                    message: { type: "string", example: "Para la pizza 🍕", description: "Mensaje opcional para el destinatario (máx 100 caracteres)." }
                },
            },
            TransferResult: {
                type: "object",
                properties: {
                    message: { type: "string", example: "Transferencia exitosa" },
                    transaction: {
                        type: "object",
                        properties: {
                            id: { type: "integer", example: 13 },
                            receiverName: { type: "string", example: "Juan Pérez" },
                            receiverAlias: { type: "string", example: "juan.perez" },
                            amount: { type: "number", example: 2500 },
                            currencyCode: { type: "string", example: "ARS" },
                            transactionDate: { type: "string", format: "date-time", example: "2026-09-05T14:05:32.000Z" },
                        },
                    },
                },
            },
            ChatMessage: {
                type: "object",
                required: ["role", "text"],
                properties: {
                    role: { type: "string", enum: ["user", "model"], example: "user" },
                    text: { type: "string", example: "¿Qué monedas soporta NomaPay?" },
                },
            },
            ChatbotInput: {
                type: "object",
                required: ["message"],
                properties: {
                    message: { type: "string", example: "¿Cómo se calcula la comisión de un intercambio?" },
                    history: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ChatMessage" },
                        description: "Turnos previos de la conversación (los últimos 20 se usan como contexto). El historial vive del lado del cliente, el backend no lo persiste.",
                    },
                },
            },
            ChatbotResult: {
                type: "object",
                properties: {
                    reply: { type: "string", example: "NomaPay cobra una comisión del 0.5% sobre el monto de origen en cada intercambio." },
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
            delete: {
                tags: ["Users"],
                summary: "Eliminar cuenta de usuario (Soft Delete)",
                description: "Marca la cuenta como eliminada lógicamente, liberando el email, username y alias. Borra la cookie de sesión.",
                security: [{ cookieAuth: [] }],
                responses: {
                    "200": { description: "Cuenta eliminada correctamente" },
                    "400": errorResponse("No podés eliminar tu cuenta porque tenés saldo a favor"),
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Usuario no encontrado"),
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
        "/users/me/theme": {
            patch: {
                tags: ["Users"],
                summary: "Cambiar la preferencia de tema (claro/oscuro)",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["theme"],
                                properties: {
                                    theme: { type: "string", enum: ["light", "dark"], example: "dark" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Tema actualizado correctamente",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                    },
                    "400": errorResponse("El theme debe ser 'light' o 'dark'"),
                    "401": errorResponse("No autenticado"),
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
                    "Convierte un monto de fromCurrency a toCurrency dentro de la misma wallet, usando la tasa de cambio actual (con caché). Se cobra una comisión (TRANSACTION_FEE_PERCENTAGE) sobre el monto de origen. El usuario elige libremente ambas monedas. Al completarse, se notifica al usuario por email (el mail lo envía el servicio de mail del front; si falla, no afecta el resultado del exchange).",
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
        "/wallets/deposit": {
            post: {
                tags: ["Wallets"],
                summary: "Cargar dinero simulado a la wallet",
                description: "Suma un monto directo al balance de la moneda elegida. No hay conversión ni comisión (a diferencia de /wallets/me/exchange). El monto máximo por carga depende de la moneda: 10.000 USD, 50.000.000 ARS y 170.000 BRL. Una moneda sin límite propio configurado usa DEFAULT_MAX_DEPOSIT_AMOUNT.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/DepositInput" } } },
                },
                responses: {
                    "201": {
                        description: "Depósito acreditado",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/DepositResult" } } },
                    },
                    "400": errorResponse("Falta la moneda o el monto, el monto es <= 0, supera el máximo permitido, o la moneda no está disponible"),
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("Este usuario no tiene una wallet asociada"),
                },
            },
        },

        "/transfers": {
            post: {
                tags: ["Transfers"],
                summary: "Transferir dinero a otro usuario",
                description: "Transfiere un monto de una moneda desde la wallet del usuario autenticado hacia la de otro usuario, identificado por su alias o CBU. No se cobra comisión. Al completarse, se notifica por email tanto al emisor como al receptor (el mail lo envía el servicio de mail del front; si falla, no afecta el resultado de la transferencia).",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/TransferInput" } } },
                },
                responses: {
                    "201": {
                        description: "Transferencia completada",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/TransferResult" } } },
                    },
                    "400": errorResponse("Faltan datos, el monto es <= 0, la moneda no está disponible, saldo insuficiente, o intentaste transferirte a vos mismo"),
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("No se encontró un usuario con ese alias/CBU, o falta la wallet del emisor/receptor"),
                },
            },
        },
        "/history": {
            get: {
                tags: ["Wallets"],
                summary: "Obtener historial de movimientos (Analytics)",
                description: "Devuelve todo el historial de operaciones (cargas, cobros, pagos, cambios) de la wallet del usuario, ordenado del más reciente al más antiguo.",
                security: [{ cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Historial completo obtenido",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "integer", example: 15 },
                                            operationType: { type: "string", enum: ["carga", "pago", "cobro", "cambio"], example: "cobro" },
                                            status: { type: "string", example: "completed" },
                                            transactionDate: { type: "string", format: "date-time", example: "2026-09-06T14:05:32.000Z" },
                                            amount: { type: "number", example: 2500 },
                                            currencyCode: { type: "string", example: "ARS" },
                                            fee: { type: "number", example: 12.5, description: "Comisión cobrada. Siempre 0 en transferencias." },
                                            message: { type: "string", nullable: true, example: "Para la pizza 🍕" },
                                            counterparty: {
                                                type: "object",
                                                nullable: true,
                                                description: "Solo aparece si es un pago o cobro (transferencia).",
                                                properties: {
                                                    name: { type: "string", example: "María Gómez" },
                                                    alias: { type: "string", example: "maria.gomez" }
                                                }
                                            },
                                            exchangeData: {
                                                type: "object",
                                                nullable: true,
                                                properties: {
                                                    currencyOrigin: { type: "string", example: "ARS" },
                                                    currencyDestination: { type: "string", example: "USD" },
                                                    finalAmount: { type: "number", example: 2.5 }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("El usuario no tiene una wallet asociada"),
                }
            }
        },

        "/contacts": {
            get: {
                tags: ["Transfers"],
                summary: "Obtener contactos frecuentes",
                description: "Devuelve hasta 3 usuarios con los que el usuario autenticado tuvo más interacciones (transferencias enviadas o recibidas). Si no tiene historial, devuelve un array vacío [].",
                security: [{ cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Lista de contactos obtenida (Top 3)",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "integer", example: 8 },
                                            alias: { type: "string", nullable: true, example: "maria.gomez" },
                                            cbu: { type: "string", nullable: true, example: "0000003100012345678902" },
                                            name: { type: "string", example: "María" },
                                            surname: { type: "string", example: "Gómez" },
                                            profilePictureUrl: { type: "string", nullable: true },
                                            interactionCount: { type: "integer", example: 5 }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": errorResponse("No autenticado"),
                    "404": errorResponse("El usuario no tiene una wallet asociada"),
                }
            }
        },

        "/chatbot/message": {
            post: {
                tags: ["Chatbot"],
                summary: "Enviar un mensaje al asistente",
                description: "Manda un mensaje al chatbot de soporte (Gemini) y devuelve su respuesta. El bot solo responde en base a un system prompt: no tiene acceso a la base de datos ni a datos reales de ningún usuario, y está limitado a temas de NomaPay.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: "#/components/schemas/ChatbotInput" } } },
                },
                responses: {
                    "200": {
                        description: "Respuesta generada por el asistente",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/ChatbotResult" } } },
                    },
                    "400": errorResponse("Falta el mensaje, o es demasiado largo"),
                    "401": errorResponse("No autenticado"),
                    "502": errorResponse("No se pudo generar una respuesta o no se pudo conectar con Gemini"),
                    "503": errorResponse("El chatbot no está disponible: falta configurar GEMINI_API_KEY"),
                },
            },
        },
    },
};