// services/exchange-rate.service.ts
//
// Integración con una API externa de tasas de cambio (ExchangeRate-API, endpoint
// "Open Access" gratuito: https://www.exchangerate-api.com/docs/free — no requiere API key).
// Documentación: GET https://open.er-api.com/v6/latest/{BASE} devuelve, para cada
// moneda del sistema, cuántas unidades de esa moneda equivalen a 1 unidad de {BASE}.
//
// Convención usada en todo NomaPay:
//   exchangeRate(origen, destino) = cuántas unidades de "origen" valen 1 unidad de "destino"
//   (ej: exchangeRate('ARS', 'USD') = 1300 significa "1 USD = 1300 ARS", tal como se
//   expresa habitualmente el tipo de cambio en Argentina).
//
// Esto se resuelve pidiendo las tasas con base = destino, y leyendo rates[origen].
//
// Cache: las tasas se guardan en memoria por moneda base con un TTL configurable
// (EXCHANGE_RATE_CACHE_TTL_MS, default 1 hora). La API gratuita solo actualiza una vez
// por día, así que cachear evita pegarle a la API en cada compra/venta/exchange y nos
// protege de rate limiting. Si la API externa falla y hay una entrada vencida en caché,
// se usa igual esa tasa "stale" en vez de romper la operación (mejor una tasa un poco
// vieja que un 502 en medio de una compra).

import { fetchJson } from '../api-calls/apicall.js';
import { AppError, ValidationError } from '../errors/app-error.js';

interface ExchangeRateApiResponse {
    result: string;
    base_code: string;
    rates: Record<string, number>;
    time_last_update_utc?: string;
    'error-type'?: string;
}

interface CacheEntry {
    rates: Record<string, number>;
    fetchedAt: number;
}

const EXCHANGE_RATE_API_BASE_URL =
    process.env.EXCHANGE_RATE_API_BASE_URL?.replace(/\/+$/, '') ?? 'https://open.er-api.com/v6/latest';

const CACHE_TTL_MS = Number(process.env.EXCHANGE_RATE_CACHE_TTL_MS ?? 60 * 60 * 1000); // 1 hora

// Cache en memoria, en el scope del módulo: vive mientras viva el proceso de Node.
// Alcanza para un servicio single-instance como el de Railway; si en el futuro se
// escala a múltiples instancias conviene mover esto a Redis, pero para el volumen
// de este proyecto no hace falta.
const ratesCache = new Map<string, CacheEntry>();

function isCacheValid(entry: CacheEntry | undefined): boolean {
    return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Devuelve el mapa completo de tasas para una moneda base, usando la caché en
 * memoria cuando es válida. Si la API externa falla pero hay una entrada vencida
 * en caché, la usa como fallback en vez de propagar el error.
 */
export async function getRatesForBase(baseCurrency: string): Promise<Record<string, number>> {
    const base = baseCurrency.toUpperCase();
    const cached = ratesCache.get(base);

    if (isCacheValid(cached)) {
        return cached!.rates;
    }

    try {
        const data = await fetchJson<ExchangeRateApiResponse>(`${EXCHANGE_RATE_API_BASE_URL}/${base}`);

        if (data.result !== 'success' || !data.rates) {
            throw new AppError(
                502,
                `La API de tasas de cambio devolvió una respuesta inválida para ${base}.`
            );
        }

        ratesCache.set(base, { rates: data.rates, fetchedAt: Date.now() });
        return data.rates;
    } catch (err) {
        if (cached) {
            console.warn(
                `⚠️  No se pudo refrescar la tasa de cambio para ${base}, se usa la última caché conocida.`,
                err
            );
            return cached.rates;
        }
        if (err instanceof AppError) throw err;
        throw new AppError(502, `No se pudo obtener la tasa de cambio para ${base}.`);
    }
}

/**
 * Tasa de cambio entre dos monedas: cuántas unidades de `originCurrency`
 * equivalen a 1 unidad de `destinationCurrency`.
 */
export async function getExchangeRate(
    originCurrency: string,
    destinationCurrency: string
): Promise<number> {
    const origin = originCurrency.toUpperCase();
    const destination = destinationCurrency.toUpperCase();

    if (origin === destination) {
        return 1;
    }

    const rates = await getRatesForBase(destination);
    const rate = rates[origin];

    if (typeof rate !== 'number' || Number.isNaN(rate)) {
        throw new ValidationError(
            `No hay tasa de cambio disponible entre ${origin} y ${destination}.`
        );
    }

    return rate;
}

/** Limpia toda la caché de tasas. Pensado para tests. */
export function clearExchangeRateCache(): void {
    ratesCache.clear();
}