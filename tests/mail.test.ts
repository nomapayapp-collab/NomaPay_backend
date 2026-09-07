
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function makeUser(overrides: Partial<{ id: number; name: string; surname: string; email: string }> = {}) {
  return {
    id: 1,
    name: 'Gisella',
    surname: 'Fernández',
    email: 'gisella@test.com',
    ...overrides,
  } as any;
}

const baseDetails = {
  type: 'deposit' as const,
  amount: '100.00',
  fee: '0.00',
  finalAmount: '100.00',
  currencyOrigin: 'ARS',
  currencyDestination: 'ARS',
  exchangeRate: '1.00',
  transactionDate: new Date('2026-01-01T15:30:00Z'),
};

describe('mail.ts — sendTransactionEmail', () => {
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

  it('arma el body con to/type/variables mapeando los datos de la transacción', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');
    const user = makeUser({ email: 'gisella@test.com', name: 'Gisella' });

    await sendTransactionEmail(user, { ...baseDetails, type: 'deposit' });

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.to).toBe('gisella@test.com');
    expect(body.type).toBe('transaction_deposit');
    expect(body.variables).toEqual(
      expect.objectContaining({
        NOMBRE: 'Gisella',
        MONTO: '100.00',
        MONEDA_ORIGEN: 'ARS',
        COMISION: '0.00',
        MONTO_FINAL: '100.00',
        MONEDA_DESTINO: 'ARS',
        TASA_CAMBIO: '1.00',
        CONTRAPARTE: '',
      })
    );
    expect(typeof body.variables.FECHA).toBe('string');
    expect(body.variables.FECHA.length).toBeGreaterThan(0);
  });

  it('usa "transaction_exchange" para type=exchange', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, type: 'exchange' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).type).toBe('transaction_exchange');
  });

  it('usa "transaction_sent" para type=transfer con role=sender, incluyendo la contraparte', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'sender',
      counterpartyName: 'Juan Pérez',
    });

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.type).toBe('transaction_sent');
    expect(body.variables.CONTRAPARTE).toBe('Juan Pérez');
  });

  it('usa "transaction_received" para type=transfer con role=receiver', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'receiver',
      counterpartyName: 'Gisella Fernández',
    });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).type).toBe('transaction_received');
  });

  it('usa "transaction_sent" como fallback si type=transfer no trae role', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, type: 'transfer' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).type).toBe('transaction_sent');
  });

  it('loguea error pero no tira excepción si el servicio de mail responde con error', async () => {
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
});