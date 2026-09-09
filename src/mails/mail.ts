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

// ============================================================================
// Transacciones (transferencias y conversiones de divisas)
// ============================================================================

export interface TransactionEmailDetails {
  type: TransactionType; // 'transfer' | 'exchange' (deposit todavía no tiene template)
  /** Resultado de la operación. Opcional: si no viene se asume 'completed'. */
  status?: 'completed' | 'rejected';
  /** N° de operación a mostrar en el comprobante (ej. "NP-88213X"). Opcional:
   *  si no viene, se genera una referencia a partir de la fecha. */
  operationNumber?: string;
  amount: string;
  fee: string;
  finalAmount: string;
  currencyOrigin: string;
  currencyDestination: string;
  /** Requerido para 'exchange' (tipo de cambio usado, ej. "1 USD = 1.180 ARS"). */
  exchangeRate?: string;
  transactionDate: Date;
  role?: 'sender' | 'receiver'; // solo aplica a 'transfer'
  counterpartyName?: string; // solo aplica a 'transfer'

  // --- Transferencia EXITOSA enviada por el usuario (role: 'sender') ---
  counterpartyAlias?: string;
  sourceAccount?: string;

  // --- Transferencia EXITOSA recibida por el usuario (role: 'receiver') ---
  destinationAccount?: string;

  // --- Transferencia / conversión RECHAZADA. El alias/CBU y las monedas ya
  //     se validan antes de intentar la operación, así que esto es siempre
  //     por una falla técnica/de infraestructura, nunca por datos inválidos.
  rejectionReason?: string;
}

/** Decide qué key de EMAIL_TEMPLATES usar. Para 'transfer' hay 3 templates
 *  (transaction_sent, transaction_sent_rejected, transaction_received) y para
 *  'exchange' hay 2 (exchange_success, exchange_rejected) — ver
 *  _email-templates.ts. Un rechazo de transferencia nunca se le manda a quien
 *  recibe. */
function buildTemplateType(details: TransactionEmailDetails): string {
  const status = details.status ?? 'completed';

  if (details.type === 'transfer') {
    if (details.role === 'receiver') return 'transaction_received';
    return status === 'rejected' ? 'transaction_sent_rejected' : 'transaction_sent';
  }

  if (details.type === 'exchange') {
    return status === 'rejected' ? 'exchange_rejected' : 'exchange_success';
  }

  // deposit: todavía no tiene template en Stripo (pendiente).
  return `transaction_${details.type}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Referencia de respaldo para {{NUMERO_OPERACION}} cuando quien llama no
 *  pasa operationNumber. No es un id de base de datos, solo texto para que
 *  el mail no muestre un hueco vacío. */
function buildFallbackOperationNumber(date: Date): string {
  return `NP-${date.getTime().toString(36).toUpperCase()}`;
}

/** Arma el objeto de variables que espera cada template. Los nombres de acá
 *  tienen que ser EXACTAMENTE los mismos {{...}} que usa cada template en
 *  _email-templates.ts, si no el campo llega vacío al mail. */
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
  const sinCargo = !details.fee || details.fee === '0' || details.fee === '0.00';
  const comision = sinCargo ? 'Sin cargo' : `${details.fee} ${details.currencyOrigin}`;

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

  if (templateType === 'exchange_success') {
    return {
      ...common,
      MONTO_ORIGEN: details.amount,
      MONEDA_ORIGEN: details.currencyOrigin,
      MONTO_FINAL: details.finalAmount,
      MONEDA_DESTINO: details.currencyDestination,
      TASA_CAMBIO: details.exchangeRate ?? '—',
      COMISION: comision,
      FECHA: formatDate(details.transactionDate),
    };
  }

  if (templateType === 'exchange_rejected') {
    return {
      ...common,
      MONTO_ORIGEN: details.amount,
      MONEDA_ORIGEN: details.currencyOrigin,
      MONEDA_DESTINO: details.currencyDestination,
      MOTIVO_MENSAJE:
        details.rejectionReason ?? 'Tuvimos un problema técnico y no pudimos completar la conversión.',
      FECHA: formatDate(details.transactionDate),
    };
  }

  // transaction_sent (transferencia enviada, exitosa)
  return {
    ...common,
    MONEDA: details.currencyOrigin,
    CONTRAPARTE: details.counterpartyName ?? '—',
    ALIAS: details.counterpartyAlias ?? '—',
    COMISION: comision,
    ORIGEN: details.sourceAccount ?? `Saldo en ${details.currencyOrigin}`,
    FECHA: formatDate(details.transactionDate),
  };
}

// ============================================================================
// Mails que no son de una transacción (registro, baja de cuenta, resumen)
// ============================================================================

export interface AccountDeletionEmailDetails {
  deletedAt: Date;
  /** Saldo final ya formateado para mostrar, ej. "ARS 0,00". */
  finalBalance: string;
  ticketId: string;
  reactivationDeadline: Date;
  reactivationLink: string;
}

export interface WeeklySummaryEmailDetails {
  /** Ej. "1 — 7 de Septiembre". */
  rangeLabel: string;
  /** Ya formateado con moneda, ej. "USD 9.504,60". */
  totalBalance: string;
  /** amountShort: solo el número (va con +/− delante en el tile).
   *  amountFull: número + moneda (va en la fila de "Esta semana"). */
  income: { amountShort: string; amountFull: string; count: number };
  expenses: { amountShort: string; amountFull: string; count: number };
  exchanges: { amountShort: string; amountFull: string; count: number };
  /** Si no hay datos suficientes en la semana, no mandar este campo. */
  bestDay?: { label: string; detail: string };
  /** Texto libre para el pie de página (compara con la semana pasada, o
   *  avisa que todavía no hay datos para comparar la primera vez). */
  comparisonText: string;
  movementsLink: string;
  preferencesLink: string;
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


export async function sendPasswordResetEmail(user: User, resetLink: string): Promise<void> {
  if (!user.email) return;
  if (!MAIL_SERVICE_ENABLED) {
    console.log(`✉️  [servicio de mail deshabilitado] Se habría notificado a ${user.email} con link: ${resetLink}`);
    return;
  }

  await callMailService({
    to: user.email,
    type: 'reset_password',
    variables: {
      NOMBRE: user.name,
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      RESET_LINK: resetLink,
    },
  });
}

/** Llamar cuando se crea el usuario, para que confirme su email. */
export async function sendWelcomeEmail(user: User, confirmLink: string): Promise<void> {
  if (!user.email) return;
  if (!MAIL_SERVICE_ENABLED) {
    console.log(`✉️  [servicio de mail deshabilitado] Se habría notificado a ${user.email}`);
    return;
  }

  await callMailService({
    to: user.email,
    type: 'welcome',
    variables: {
      NOMBRE: user.name,
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      CONFIRM_LINK: confirmLink,
    },
  });
}

/** Llamar cuando se confirma la baja de la cuenta (después de borrar/anonimizar
 *  los datos correspondientes). */
export async function sendAccountDeletionEmail(user: User, details: AccountDeletionEmailDetails): Promise<void> {
  if (!user.email) return;
  if (!MAIL_SERVICE_ENABLED) {
    console.log(`✉️  [servicio de mail deshabilitado] Se habría notificado a ${user.email}`);
    return;
  }

  await callMailService({
    to: user.email,
    type: 'account_deletion',
    variables: {
      NOMBRE: user.name,
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      DELETED_AT: formatDate(details.deletedAt),
      FINAL_BALANCE: details.finalBalance,
      TICKET_ID: details.ticketId,
      REACTIVATION_DEADLINE: formatDate(details.reactivationDeadline),
      REACTIVATION_LINK: details.reactivationLink,
    },
  });
}

/** Llamar desde el job/cron que arma el resumen semanal de cada usuario. */
export async function sendWeeklySummaryEmail(user: User, details: WeeklySummaryEmailDetails): Promise<void> {
  if (!user.email) return;
  if (!MAIL_SERVICE_ENABLED) {
    console.log(`✉️  [servicio de mail deshabilitado] Se habría notificado a ${user.email}`);
    return;
  }

  await callMailService({
    to: user.email,
    type: 'weekly_summary',
    variables: {
      RANGO_FECHAS: details.rangeLabel,
      BALANCE_TOTAL: details.totalBalance,
      ENTRADAS_MONTO: details.income.amountShort,
      ENTRADAS_COUNT: String(details.income.count),
      ENTRADAS_TOTAL: details.income.amountFull,
      SALIDAS_MONTO: details.expenses.amountShort,
      SALIDAS_COUNT: String(details.expenses.count),
      SALIDAS_TOTAL: details.expenses.amountFull,
      CAMBIOS_MONTO: details.exchanges.amountShort,
      CAMBIOS_COUNT: String(details.exchanges.count),
      CAMBIOS_TOTAL: details.exchanges.amountFull,
      MEJOR_DIA: details.bestDay?.label ?? '—',
      MEJOR_DIA_DETALLE: details.bestDay?.detail ?? 'Todavía no tuviste movimientos esta semana.',
      MOVIMIENTOS_LINK: details.movementsLink,
      TEXTO_COMPARACION: details.comparisonText,
      USER_EMAIL: user.email,
      PREFERENCIAS_LINK: details.preferencesLink,
    },
  });
}