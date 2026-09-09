
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { validateTransfer } from '../src/middlewares/transfer.validator.js';
import type { Request, Response, NextFunction } from 'express';

describe('transfer.validator — validateTransfer', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;
    let jsonMock: Mock;
    let statusMock: Mock;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        res = { status: statusMock };
        next = vi.fn();
    });

    it('rechaza si falta aliasOrCbu', () => {
        req = { body: { currencyCode: 'ARS', amount: 100 } };
        validateTransfer(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Falta ingresar el alias o CBU de destino.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('rechaza si falta currencyCode', () => {
        req = { body: { aliasOrCbu: 'juan.perez', amount: 100 } };
        validateTransfer(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Falta elegir la moneda (currencyCode).' });
        expect(next).not.toHaveBeenCalled();
    });

    it('rechaza si el monto es <= 0 o no numérico', () => {
        req = { body: { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: -10 } };
        validateTransfer(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'El monto a transferir debe ser mayor a 0.' });
    });

    it('rechaza si message no es un string', () => {
        req = { body: { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100, message: 12345 } };
        validateTransfer(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'El mensaje debe ser texto.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('rechaza si message supera los 100 caracteres', () => {
        req = {
            body: {
                aliasOrCbu: 'juan.perez',
                currencyCode: 'ARS',
                amount: 100,
                message: 'a'.repeat(101),
            },
        };
        validateTransfer(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'El mensaje no puede superar los 100 caracteres.' });
        expect(next).not.toHaveBeenCalled();
    });

    it('llama a next() cuando los datos son válidos y tiene mensaje <= 100 caracteres', () => {
        req = {
            body: {
                aliasOrCbu: 'juan.perez',
                currencyCode: 'ARS',
                amount: 100,
                message: 'Pago de expensas',
            },
        };
        validateTransfer(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(statusMock).not.toHaveBeenCalled();
    });

    it('llama a next() cuando los datos son válidos sin mensaje', () => {
        req = {
            body: {
                aliasOrCbu: 'juan.perez',
                currencyCode: 'ARS',
                amount: 100,
            },
        };
        validateTransfer(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});