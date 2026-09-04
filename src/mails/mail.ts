// mails/mail.ts
//
// Envío de emails transaccionales vía AWS SES (SDK v3).
// Sigue el mismo patrón de inicialización perezosa que src/services/google.service.ts:
// el cliente de SES solo se crea la primera vez que hace falta, y si faltan las
// credenciales de AWS el server NO se cae al arrancar (evita repetir el bug que
// tuvimos con GOOGLE_CLIENT_ID). Un fallo al enviar un email tampoco debe hacer
// fallar la operación de negocio (compra/venta/exchange), por eso todos los errores
// se atrapan y solo se loguean.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { User } from '../models/users.model.js';
import type { TransactionType } from '../models/transaction.model.js';

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return sesClient;
}

// Permite desactivar el envío real en desarrollo/tests sin tocar código
// (SES_ENABLED=false en el .env local).
const SES_ENABLED = process.env.SES_ENABLED !== 'false';

function getSourceEmail(): string | undefined {
  return process.env.SES_SOURCE_EMAIL;
}

/**
 * Envío genérico de un email vía SES. Nunca lanza: si algo falla, loguea el
 * error y devuelve sin cortar el flujo que lo llamó.
 */
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
  if (!SES_ENABLED) {
    console.log(`✉️  [SES deshabilitado] Se habría enviado "${subject}" a ${to}`);
    return;
  }

  const source = getSourceEmail();
  if (!source) {
    console.warn('⚠️  Falta configurar SES_SOURCE_EMAIL: no se pudo enviar el email.');
    return;
  }

  try {
    const command = new SendEmailCommand({
      Source: source,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
        },
      },
    });

    await getSesClient().send(command);
  } catch (err) {
    console.error(`❌ Error al enviar email a ${to} vía SES:`, err);
  }
}

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  buy: 'Compra',
  sell: 'Venta',
  exchange: 'Intercambio',
  transfer: 'Transferencia',
};

export interface TransactionEmailDetails {
  type: TransactionType;
  amount: string;
  fee: string;
  finalAmount: string;
  currencyOrigin: string;
  currencyDestination: string;
  exchangeRate: string;
  transactionDate: Date;
}

function buildTransactionEmailHtml(user: User, details: TransactionEmailDetails): string {
  const label = TRANSACTION_TYPE_LABELS[details.type];
  const formattedDate = details.transactionDate.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #0f172a;">NomaPay</h2>
      <p>Hola ${user.name},</p>
      <p>Tu operación de <strong>${label.toLowerCase()}</strong> se procesó correctamente.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Monto debitado</td>
          <td style="padding: 6px 0; text-align: right;"><strong>${details.amount} ${details.currencyOrigin}</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Comisión</td>
          <td style="padding: 6px 0; text-align: right;">${details.fee} ${details.currencyOrigin}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Monto acreditado</td>
          <td style="padding: 6px 0; text-align: right;"><strong>${details.finalAmount} ${details.currencyDestination}</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Tasa de cambio</td>
          <td style="padding: 6px 0; text-align: right;">1 ${details.currencyDestination} = ${details.exchangeRate} ${details.currencyOrigin}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Fecha</td>
          <td style="padding: 6px 0; text-align: right;">${formattedDate}</td>
        </tr>
      </table>
      <p style="color: #64748b; font-size: 12px;">Si no reconocés esta operación, contactate con soporte de NomaPay.</p>
    </div>
  `.trim();
}

/**
 * Notifica al usuario por email luego de una compra, venta o exchange completado.
 * Se llama SIEMPRE después de que la transacción de DB ya hizo commit, para que
 * un fallo de SES nunca pueda revertir ni bloquear la operación financiera.
 */
export async function sendTransactionEmail(user: User, details: TransactionEmailDetails): Promise<void> {
  if (!user.email) return;

  const label = TRANSACTION_TYPE_LABELS[details.type];
  const subject = `NomaPay · ${label} confirmada: ${details.finalAmount} ${details.currencyDestination}`;
  const html = buildTransactionEmailHtml(user, details);

  await sendEmail(user.email, subject, html);
}