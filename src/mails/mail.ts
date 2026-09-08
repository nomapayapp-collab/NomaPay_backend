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

  status?: 'completed' | 'rejected';

  operationNumber?: string;
  amount: string;
  fee: string;
  finalAmount: string;
  currencyOrigin: string;
  currencyDestination: string;

  exchangeRate?: string;
  transactionDate: Date;
  role?: 'sender' | 'receiver';
  counterpartyName?: string;


  counterpartyAlias?: string;
  sourceAccount?: string;

  destinationAccount?: string;

  rejectionReason?: string;
}


function buildTemplateType(details: TransactionEmailDetails): string {
  const status = details.status ?? 'completed';
  if (details.type === 'transfer') {
    if (details.role === 'receiver') return 'transaction_received';
    return status === 'rejected' ? 'transaction_sent_rejected' : 'transaction_sent';
  }
  return `transaction_${details.type}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildFallbackOperationNumber(date: Date): string {
  return `NP-${date.getTime().toString(36).toUpperCase()}`;
}

function buildVariables(
  templateType: string,
  details: TransactionEmailDetails,
  userName: string
): Record<string, string> {
  const common = {
    NOMBRE: userName,
    MONTO: details.amount,
    NUMERO_OPERACION: details.operationNumber ?? buildFallbackOperationNumber(details.transactionDate),
  };

  if (templateType === 'transaction_sent_rejected') {
    return {
      ...common,
      MONEDA: details.currencyOrigin,
      MOTIVO_MENSAJE:
        details.rejectionReason ?? 'Tuvimos un problema técnico y no pudimos completar la transferencia.',
      CONTRAPARTE: details.counterpartyName ?? '—',
      FECHA: formatDate(details.transactionDate),
    };
  }

  if (templateType === 'transaction_received') {
    return {
      ...common,
      MONEDA: details.currencyDestination,
      CONTRAPARTE: details.counterpartyName ?? '—',
      DESTINO: details.destinationAccount ?? `Saldo en ${details.currencyDestination}`,
      FECHA: formatDate(details.transactionDate),
    };
  }


  const sinCargo = !details.fee || details.fee === '0' || details.fee === '0.00';
  return {
    ...common,
    MONEDA: details.currencyOrigin,
    CONTRAPARTE: details.counterpartyName ?? '—',
    ALIAS: details.counterpartyAlias ?? '—',
    COMISION: sinCargo ? 'Sin cargo' : `${details.fee} ${details.currencyOrigin}`,
    ORIGEN: details.sourceAccount ?? `Saldo en ${details.currencyOrigin}`,
    FECHA: formatDate(details.transactionDate),
  };
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

  const type = buildTemplateType(details);

  await callMailService({
    to: user.email,
    type,
    variables: buildVariables(type, details, user.name),
  });
}