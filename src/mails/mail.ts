

import type { User } from '../models/users.model.js';
import type { TransactionType } from '../models/transaction.model.js';

const MAIL_SERVICE_ENABLED = process.env.MAIL_SERVICE_ENABLED !== 'false';
const MAIL_SERVICE_TIMEOUT_MS = 8000;

function getMailServiceUrl(): string | undefined {
  return process.env.MAIL_SERVICE_URL;
}
function getMailInternalSecret(): string | undefined {
  return process.env.MAIL_INTERNAL_SECRET;
}

export interface TransactionEmailDetails {
  type: TransactionType;
  amount: string;
  fee: string;
  finalAmount: string;
  currencyOrigin: string;
  currencyDestination: string;
  exchangeRate?: string;
  transactionDate: Date;
  role?: 'sender' | 'receiver';
  counterpartyName?: string;
}


function buildTemplateType(details: TransactionEmailDetails): string {
  if (details.type === 'transfer') {
    return details.role === 'receiver' ? 'transaction_received' : 'transaction_sent';
  }
  return `transaction_${details.type}`;
}

async function callMailService(payload: { to: string; type: string; variables: Record<string, string> }): Promise<void> {
  const baseUrl = getMailServiceUrl();
  if (!baseUrl) {
    console.warn('⚠️  Falta configurar MAIL_SERVICE_URL: no se pudo notificar por mail.');
    return;
  }
  const secret = getMailInternalSecret();
  if (!secret) {
    console.warn('⚠️  Falta configurar MAIL_INTERNAL_SECRET: no se pudo notificar por mail.');
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MAIL_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/send-mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`❌ El servicio de mail respondió ${response.status} al notificar a ${payload.to}`);
    }
  } catch (err) {
    console.error(`❌ Error al llamar al servicio de mail para notificar a ${payload.to}:`, err);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendTransactionEmail(user: User, details: TransactionEmailDetails): Promise<void> {
  if (!user.email) return;

  if (!MAIL_SERVICE_ENABLED) {
    console.log(`✉️  [servicio de mail deshabilitado] Se habría notificado a ${user.email}`);
    return;
  }

  const formattedDate = details.transactionDate.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  await callMailService({
    to: user.email,
    type: buildTemplateType(details),
    variables: {
      NOMBRE: user.name,
      MONTO: details.amount,
      MONEDA_ORIGEN: details.currencyOrigin,
      COMISION: details.fee,
      MONTO_FINAL: details.finalAmount,
      MONEDA_DESTINO: details.currencyDestination,
      TASA_CAMBIO: details.exchangeRate ?? '',
      FECHA: formattedDate,
      CONTRAPARTE: details.counterpartyName ?? '',
    },
  });
}