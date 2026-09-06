// Proveedor primario: ExchangeRate-API, endpoint "Open Access" gratuito
//   (https://www.exchangerate-api.com/docs/free — no requiere API key).
//   GET https://open.er-api.com/v6/latest/{BASE}
//
// Proveedor de respaldo: fawazahmed0/currency-api, servido gratis vía CDN de jsDelivr
//   (https://github.com/fawazahmed0/currency-api — no requiere API key, sin límite de rate,
//   actualizado a diario). Se usa solo si el primario falla.
//   GET https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base}.json
//
// Convención usada en todo NomaPay:
//   exchangeRate(origen, destino) = cuántas unidades de "origen" valen 1 unidad de "destino"
//   (ej: exchangeRate('ARS', 'USD') = 1300 significa "1 USD = 1300 ARS", tal como se
//   expresa habitualmente el tipo de cambio en Argentina).


import { fetchJson } from '../api-calls/apicall.js';
import { AppError, ValidationError } from '../errors/app-error.js';

interface PrimaryApiResponse {
    result: string;
    base_code: string;
    rates: Record<string, number>;
    time_last_update_utc?: string;
    'error-type'?: string;
}

type FallbackApiResponse = Record<string, string | Record<string, number>>;

interface CacheEntry {
    rates: Record<string, number>;
    fetchedAt: number;
}

const PRIMARY_API_BASE_URL =
    process.env.EXCHANGE_RATE_API_BASE_URL?.replace(/\/+$/, '') ?? 'https://open.er-api.com/v6/latest';

const FALLBACK_API_BASE_URL =
    process.env.FALLBACK_EXCHANGE_RATE_API_BASE_URL?.replace(/\/+$/, '') ??
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies';

const CACHE_TTL_MS = Number(process.env.EXCHANGE_RATE_CACHE_TTL_MS ?? 60 * 60 * 1000); // 1 hora


const ratesCache = new Map<string, CacheEntry>();

function isCacheValid(entry: CacheEntry | undefined): boolean {
    return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}


function normalizeRates(rates: Record<string, number>): Record<string, number> {
    const normalized: Record<string, number> = {};
    for (const [code, value] of Object.entries(rates)) {
        normalized[code.toUpperCase()] = value;
    }
    return normalized;
}

async function fetchRatesFromPrimary(base: string): Promise<Record<string, number>> {
    const data = await fetchJson<PrimaryApiResponse>(`${PRIMARY_API_BASE_URL}/${base}`);

    if (data.result !== 'success' || !data.rates) {
        throw new AppError(
            502,
            `El proveedor primario de tasas de cambio devolvió una respuesta inválida para ${base}.`
        );
    }

    return normalizeRates(data.rates);
}

async function fetchRatesFromFallback(base: string): Promise<Record<string, number>> {
    const baseLower = base.toLowerCase();
    const data = await fetchJson<FallbackApiResponse>(`${FALLBACK_API_BASE_URL}/${baseLower}.json`);
    const rates = data[baseLower];

    if (!rates || typeof rates !== 'object') {
        throw new AppError(
            502,
            `El proveedor de respaldo de tasas de cambio devolvió una respuesta inválida para ${base}.`
        );
    }

    return normalizeRates(rates as Record<string, number>);
}

export async function getRatesForBase(baseCurrency: string): Promise<Record<string, number>> {
    const base = baseCurrency.toUpperCase();
    const cached = ratesCache.get(base);

    if (isCacheValid(cached)) {
        return cached!.rates;
    }

    try {
        const rates = await fetchRatesFromPrimary(base);
        ratesCache.set(base, { rates, fetchedAt: Date.now() });
        return rates;
    } catch (primaryErr) {
        console.warn(
            `⚠️  Falló el proveedor primario de tasas de cambio para ${base}, se intenta con el de respaldo.`,
            primaryErr
        );

        try {
            const rates = await fetchRatesFromFallback(base);
            ratesCache.set(base, { rates, fetchedAt: Date.now() });
            return rates;
        } catch (fallbackErr) {
            if (cached) {
                console.warn(
                    `⚠️  También falló el proveedor de respaldo para ${base}, se usa la última caché conocida.`,
                    fallbackErr
                );
                return cached.rates;
            }
            if (fallbackErr instanceof AppError) throw fallbackErr;
            throw new AppError(502, `No se pudo obtener la tasa de cambio para ${base} (fallaron ambos proveedores).`);
        }
    }
}

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


export function clearExchangeRateCache(): void {
    ratesCache.clear();
}