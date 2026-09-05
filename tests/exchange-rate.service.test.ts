
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
        vi.useRealTimers();
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

    it('si el primario responde con result != success, intenta el fallback y propaga el error si este también falla', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ result: 'error', 'error-type': 'unsupported-code' }),
            })
            .mockRejectedValueOnce(new Error('fallback también caído'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(getRatesForBase('XXX')).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('usa el proveedor de respaldo si el primario falla', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ date: '2026-09-04', usd: { ars: 1350, brl: 5.6 } }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const rate = await getExchangeRate('ARS', 'USD');

        expect(rate).toBe(1350);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toContain('/usd.json');
    });

    it('usa la caché vencida como último recurso si fallan ambos proveedores', async () => {
        const okFetch = mockFetchOnce(successResponse('USD', { ARS: 1300 }));
        vi.stubGlobal('fetch', okFetch);
        await getRatesForBase('USD');

      
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);

        const bothFailing = vi
            .fn()
            .mockRejectedValueOnce(new Error('primary down'))
            .mockRejectedValueOnce(new Error('fallback down'));
        vi.stubGlobal('fetch', bothFailing);

        const rates = await getRatesForBase('USD');

        expect(rates.ARS).toBe(1300);
        expect(bothFailing).toHaveBeenCalledTimes(2);
    });

    it('propaga un error si fallan ambos proveedores y no hay caché previa', async () => {
        const bothFailing = vi
            .fn()
            .mockRejectedValueOnce(new Error('primary down'))
            .mockRejectedValueOnce(new Error('fallback down'));
        vi.stubGlobal('fetch', bothFailing);

        await expect(getRatesForBase('USD')).rejects.toThrow();
        expect(bothFailing).toHaveBeenCalledTimes(2);
    });
});