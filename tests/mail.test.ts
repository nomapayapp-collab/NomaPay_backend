import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User as UserModel } from '../src/models/users.model.js';

const ORIGINAL_ENV = { ...process.env };

function makeUser(overrides: Partial<{ id: number; name: string; surname: string; email: string }> = {}): UserModel {
  const partial = {
    id: 1,
    name: 'Gisella',
    surname: 'Fernández',
    email: 'gisella@test.com',
    ...overrides,
  };
  return partial as unknown as UserModel;
}

const baseDetails = {
  type: 'transfer' as const,
  role: 'sender' as const,
  amount: '100.00',
  fee: '0.00',
  finalAmount: '100.00',
  currencyOrigin: 'ARS',
  currencyDestination: 'ARS',
  transactionDate: new Date('2026-01-01T15:30:00Z'),
};

function lastFetchBody(): { to: string; type: string; variables: Record<string, string> } {
  const call = vi.mocked(fetch).mock.calls[0];
  const options = call?.[1];
  const body = typeof options?.body === 'string' ? options.body : '{}';
  return JSON.parse(body);
}

describe('mail.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.MAIL_SERVICE_URL = 'https://nomapay-frontend.vercel.app';
    process.env.MAIL_INTERNAL_SECRET = 'shh-secreto';
    process.env.MAIL_SERVICE_ENABLED = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('comportamientos comunes', () => {
    it('no hace fetch si el usuario no tiene email cargado', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser({ email: '' }), baseDetails);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('no hace fetch si MAIL_SERVICE_ENABLED=false (queda solo el log)', async () => {
      process.env.MAIL_SERVICE_ENABLED = 'false';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), baseDetails);
      expect(fetch).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('gisella@test.com'));
    });

    it('llama a POST {MAIL_SERVICE_URL}/api/send-mail con los headers correctos', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), baseDetails);
      expect(fetch).toHaveBeenCalledWith(
        'https://nomapay-frontend.vercel.app/api/send-mail',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'shh-secreto' },
        })
      );
    });
  });

  describe('sendTransactionEmail', () => {
    it('arma el body correcto para transferencia enviada (transaction_sent)', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      const user = makeUser();

      await sendTransactionEmail(user, { ...baseDetails, counterpartyName: 'Juan Pérez' });

      const body = lastFetchBody();
      expect(body.type).toBe('transaction_sent');
      expect(body.variables).toEqual(
        expect.objectContaining({
          NOMBRE: 'Gisella',
          MONTO: '100.00',
          MONEDA: 'ARS',
          CONTRAPARTE: 'Juan Pérez',
          COMISION: 'Sin cargo',
          NUMERO_OPERACION: expect.any(String),
        })
      );
    });

    it('arma el body correcto para intercambio exitoso (exchange_success)', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      const user = makeUser();

      await sendTransactionEmail(user, {
        ...baseDetails,
        type: 'exchange',
        currencyOrigin: 'USD',
        currencyDestination: 'ARS',
        exchangeRate: '1200'
      });

      const body = lastFetchBody();
      expect(body.type).toBe('exchange_success');
      expect(body.variables).toEqual(
        expect.objectContaining({
          MONEDA_ORIGEN: 'USD',
          MONEDA_DESTINO: 'ARS',
          TASA_CAMBIO: '1200',
        })
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    it('arma el body correcto para welcome', async () => {
      const { sendWelcomeEmail } = await import('../src/mails/mail.js');
      await sendWelcomeEmail(makeUser(), 'https://noma.com/confirm');

      const body = lastFetchBody();
      expect(body.type).toBe('welcome');
      expect(body.variables.CONFIRM_LINK).toBe('https://noma.com/confirm');
    });
  });

  describe('sendAccountDeletionEmail', () => {
    it('arma el body correcto para baja de cuenta', async () => {
      const { sendAccountDeletionEmail } = await import('../src/mails/mail.js');
      await sendAccountDeletionEmail(makeUser(), {
        deletedAt: new Date(),
        finalBalance: 'ARS 0,00',
        ticketId: 'TKT-123',
        reactivationDeadline: new Date(),
        reactivationLink: 'https://noma.com/reactivate'
      });

      const body = lastFetchBody();
      expect(body.type).toBe('account_deletion');
      expect(body.variables.FINAL_BALANCE).toBe('ARS 0,00');
    });
  });

  describe('sendWeeklySummaryEmail', () => {
    it('arma el body correcto para el resumen semanal', async () => {
      const { sendWeeklySummaryEmail } = await import('../src/mails/mail.js');
      await sendWeeklySummaryEmail(makeUser(), {
        rangeLabel: '1 - 7 Sept',
        currencies: [
          {
            code: 'ARS',
            totalBalance: 'ARS 500,00',
            income: { amountShort: '100,00', count: 1 },
            expenses: { amountShort: '50,00', count: 2 },
            exchanges: { amountShort: '0,00', count: 0 },
            comparisonText: 'Gastaste menos que la semana pasada',
          },
          {
            code: 'USD',
            totalBalance: 'USD 0,00',
            income: { amountShort: '0,00', count: 0 },
            expenses: { amountShort: '0,00', count: 0 },
            exchanges: { amountShort: '0,00', count: 0 },
            comparisonText: 'Sin datos de la semana pasada',
          },
          {
            code: 'BRL',
            totalBalance: 'BRL 0,00',
            income: { amountShort: '0,00', count: 0 },
            expenses: { amountShort: '0,00', count: 0 },
            exchanges: { amountShort: '0,00', count: 0 },
            comparisonText: 'Sin datos de la semana pasada',
          },
        ],
        movementsLink: 'link',
        preferencesLink: 'link',
      });

      const body = lastFetchBody();
      expect(body.type).toBe('weekly_summary');
      expect(body.variables.ARS_ENTRADAS_DETALLE).toBe('1 movimiento');
    });
  });

  describe('tests originales recuperados (errores y validaciones)', () => {
    it('avisa por consola y no hace fetch si falta MAIL_SERVICE_URL', async () => {
      delete process.env.MAIL_SERVICE_URL;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), baseDetails);
      expect(fetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MAIL_SERVICE_URL'));
    });

    it('avisa por consola y no hace fetch si falta MAIL_INTERNAL_SECRET', async () => {
      delete process.env.MAIL_INTERNAL_SECRET;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), baseDetails);
      expect(fetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MAIL_INTERNAL_SECRET'));
    });

    it('loguea error pero no tira excepción si el servicio de mail responde con error (500)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await expect(sendTransactionEmail(makeUser(), baseDetails)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    });

    it('loguea error pero no tira excepción si el fetch falla (red o timeout)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await expect(sendTransactionEmail(makeUser(), baseDetails)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('gisella@test.com'), expect.any(Error));
    });

    it('usa "transaction_received" para type=transfer con role=receiver', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), {
        ...baseDetails,
        type: 'transfer',
        role: 'receiver',
        counterpartyName: 'Gisella Fernández',
      });
      const body = lastFetchBody();
      expect(body.type).toBe('transaction_received');
    });

    it('usa "transaction_sent_rejected" si la transferencia falló', async () => {
      const { sendTransactionEmail } = await import('../src/mails/mail.js');
      await sendTransactionEmail(makeUser(), {
        ...baseDetails,
        type: 'transfer',
        status: 'rejected'
      });
      const body = lastFetchBody();
      expect(body.type).toBe('transaction_sent_rejected');
    });
  });

});