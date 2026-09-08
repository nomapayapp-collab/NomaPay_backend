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

  it('el body siempre trae to/type/variables, y NUMERO_OPERACION cae al fallback si no viene operationNumber', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser({ email: 'gisella@test.com' }), baseDetails);

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.to).toBe('gisella@test.com');
    expect(body.type).toBe('transaction_deposit');
    expect(body.variables.NOMBRE).toBe('Gisella');
    expect(body.variables.MONTO).toBe('100.00');

    expect(body.variables.NUMERO_OPERACION).toMatch(/^NP-[0-9A-Z]+$/);
  });

  it('usa el operationNumber real si viene en los details, en vez del fallback', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, operationNumber: 'OP-12345' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).variables.NUMERO_OPERACION).toBe('OP-12345');
  });


  it('deposit: usa "transaction_deposit" y arma COMISION, ORIGEN y ALIAS con sus valores', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      fee: '5.00',
      sourceAccount: 'Caja de ahorro ARS',
      counterpartyAlias: 'gisella.dev',
      counterpartyName: 'Gisella Fernández',
    });

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.type).toBe('transaction_deposit');
    expect(body.variables.MONEDA).toBe('ARS');
    expect(body.variables.COMISION).toBe('5.00 ARS');
    expect(body.variables.ORIGEN).toBe('Caja de ahorro ARS');
    expect(body.variables.ALIAS).toBe('gisella.dev');
    expect(body.variables.CONTRAPARTE).toBe('Gisella Fernández');
  });

  it('deposit sin fee: COMISION queda "Sin cargo" (fee "0.00")', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, fee: '0.00' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).variables.COMISION).toBe('Sin cargo');
  });

  it('deposit sin ORIGEN/ALIAS/CONTRAPARTE explícitos: usa los defaults ("Saldo en X" y "—")', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), baseDetails);

    const [, options] = (fetch as any).mock.calls[0];
    const vars = JSON.parse(options.body).variables;
    expect(vars.ORIGEN).toBe('Saldo en ARS');
    expect(vars.ALIAS).toBe('—');
    expect(vars.CONTRAPARTE).toBe('—');
  });

  it('usa "transaction_exchange" para type=exchange', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, type: 'exchange' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).type).toBe('transaction_exchange');
  });



  it('transfer + role=sender + status=completed (default): usa "transaction_sent"', async () => {
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

  it('transfer sin role: cae a "transaction_sent" (fallback)', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), { ...baseDetails, type: 'transfer' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).type).toBe('transaction_sent');
  });

  it('transfer + role=sender + status=rejected: usa "transaction_sent_rejected" con MOTIVO_MENSAJE', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'sender',
      status: 'rejected',
      rejectionReason: 'Saldo insuficiente',
      counterpartyName: 'Juan Pérez',
    });

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.type).toBe('transaction_sent_rejected');
    expect(body.variables.MOTIVO_MENSAJE).toBe('Saldo insuficiente');
    expect(body.variables.CONTRAPARTE).toBe('Juan Pérez');
    expect(body.variables.MONEDA).toBe('ARS');
  });

  it('transaction_sent_rejected sin rejectionReason: usa el mensaje genérico por defecto', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'sender',
      status: 'rejected',
    });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).variables.MOTIVO_MENSAJE).toBe(
      'Tuvimos un problema técnico y no pudimos completar la transferencia.'
    );
  });

  it('transfer + role=receiver: usa "transaction_received" con DESTINO y MONEDA de destino', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'receiver',
      currencyDestination: 'USD',
      destinationAccount: 'Caja de ahorro USD',
      counterpartyName: 'Gisella Fernández',
    });

    const [, options] = (fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.type).toBe('transaction_received');
    expect(body.variables.MONEDA).toBe('USD');
    expect(body.variables.DESTINO).toBe('Caja de ahorro USD');
    expect(body.variables.CONTRAPARTE).toBe('Gisella Fernández');
  });

  it('transaction_received sin destinationAccount: cae al default "Saldo en X"', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), {
      ...baseDetails,
      type: 'transfer',
      role: 'receiver',
      currencyDestination: 'BRL',
    });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).variables.DESTINO).toBe('Saldo en BRL');
  });



  it('FECHA viene formateada como string no vacío', async () => {
    const { sendTransactionEmail } = await import('../src/mails/mail.js');

    await sendTransactionEmail(makeUser(), baseDetails);

    const [, options] = (fetch as any).mock.calls[0];
    const vars = JSON.parse(options.body).variables;
    expect(typeof vars.FECHA).toBe('string');
    expect(vars.FECHA.length).toBeGreaterThan(0);
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