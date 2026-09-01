

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
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Access token devuelto por /auth/login o /auth/register. Se manda como 'Authorization: Bearer <token>'.",
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
            AuthTokens: {
                type: "object",
                properties: {
                    accessToken: { type: "string", description: "JWT de corta duración para autenticar requests." },
                    refreshToken: { type: "string", description: "Token de larga duración para pedir un accessToken nuevo." },
                },
            },
            AuthResult: {
                type: "object",
                properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                    user: { $ref: "#/components/schemas/UserSummary" },
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
                        content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResult" } } },
                    },
                    "400": errorResponse("Email o contraseña incorrectos"),
                },
            },
        },
        "/auth/refresh": {
            post: {
                tags: ["Auth"],
                summary: "Renovar el access token",
                description: "Usa el refreshToken vigente para obtener un par de tokens nuevo (rotación de refresh token).",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["refreshToken"],
                                properties: { refreshToken: { type: "string" } },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Tokens renovados",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } },
                    },
                    "400": errorResponse("Falta el refreshToken"),
                },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"],
                summary: "Cerrar sesión",
                description: "Revoca el refreshToken enviado para que no se pueda volver a usar.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["refreshToken"],
                                properties: { refreshToken: { type: "string" } },
                            },
                        },
                    },
                },
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
                        content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResult" } } },
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
                        content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResult" } } },
                    },
                    "400": errorResponse("Falta el idToken de Google"),
                },
            },
        },
        "/users/me": {
            get: {
                tags: ["Users"],
                summary: "Obtener el perfil del usuario autenticado",
                security: [{ bearerAuth: [] }],
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
                security: [{ bearerAuth: [] }],
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
                security: [{ bearerAuth: [] }],
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
                security: [{ bearerAuth: [] }],
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
                security: [{ bearerAuth: [] }],
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
    },
};