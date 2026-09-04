// tests/exchange-rate.service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getExchangeRate,
    getRatesForBase,
    clearExchangeRateCache,
} from '../src/services/exchange-rate.service.js';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
    return vi.fn().mockResolvedValueOnce({
        ok,
        status,
        json: async () => body,
    });
}

const successResponse = (base: string, rates: Record<string, number>) => ({
    result: 'success',
    base_code: base,
    rates,
});

describe('exchange-rate.service', () => {
    beforeEach(() => {
        clearExchangeRateCache();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('devuelve 1 cuando origen y destino son la misma moneda (no llama a la API)', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const rate = await getExchangeRate('USD', 'USD');

        expect(rate).toBe(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('calcula la tasa consultando la API con la moneda destino como base', async () => {
        const fetchMock = mockFetchOnce(successResponse('USD', { ARS: 1300, BRL: 5.4 }));
        vi.stubGlobal('fetch', fetchMock);

        const rate = await getExchangeRate('ARS', 'USD');

        expect(rate).toBe(1300);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toContain('/USD');
    });

    it('usa la caché en la segunda llamada dentro del TTL (no vuelve a pegarle a la API)', async () => {
        const fetchMock = mockFetchOnce(successResponse('USD', { ARS: 1300 }));
        vi.stubGlobal('fetch', fetchMock);

        await getExchangeRate('ARS', 'USD');
        const rate = await getExchangeRate('ARS', 'USD');

        expect(rate).toBe(1300);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lanza un error de validación si la moneda de origen no está en la respuesta', async () => {
        const fetchMock = mockFetchOnce(successResponse('USD', { ARS: 1300 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(getExchangeRate('EUR', 'USD')).rejects.toThrow(/No hay tasa de cambio disponible/);
    });

    it('usa la caché vencida como fallback si la API externa falla', async () => {
        const okFetch = mockFetchOnce(successResponse('USD', { ARS: 1300 }));
        vi.stubGlobal('fetch', okFetch);
        await getRatesForBase('USD');

        const failingFetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
        vi.stubGlobal('fetch', failingFetch);

        const rates = await getRatesForBase('USD');

        expect(rates.ARS).toBe(1300);
    });

    it('propaga un error si la API falla y no hay ninguna caché previa', async () => {
        const failingFetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
        vi.stubGlobal('fetch', failingFetch);

        await expect(getRatesForBase('USD')).rejects.toThrow();
    });

    it('lanza un error cuando la API responde con result != success', async () => {
        const fetchMock = mockFetchOnce({ result: 'error', 'error-type': 'unsupported-code' });
        vi.stubGlobal('fetch', fetchMock);

        await expect(getRatesForBase('XXX')).rejects.toThrow(/respuesta inválida/);
    });
});