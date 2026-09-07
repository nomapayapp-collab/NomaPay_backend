// services/user.service.ts
import { User } from '../models/users.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';

export interface UserProfile {
  id: number;
  name: string;
  surname: string;
  email: string;
  username: string;
  alias: string;
  cbu: string | null;
  country: string | null;
  profilePictureUrl: string | null;
  theme: 'light' | 'dark';
}

const USERNAME_COOLDOWN_DAYS = 30;

// Campos que el usuario NUNCA puede modificar desde este endpoint.
// email/cbu: identificadores fijos. documentType/documentNumber: no editables por ahora.
const IMMUTABLE_FIELDS = ['email', 'cbu', 'documentType', 'documentNumber'] as const;

interface UpdateProfileInput {
  country?: string;
  username?: string;
  alias?: string;
  [key: string]: unknown;
}

export async function getUserProfile(userId: number): Promise<UserProfile> {
  const user = await User.findByPk(userId);

  if (!user) {
    throw new NotFoundError('Usuario no encontrado.');
  }

  return toProfile(user);
}

export async function updateUserProfile(
  userId: number,
  input: UpdateProfileInput
): Promise<UserProfile> {
  const attemptedImmutable = IMMUTABLE_FIELDS.filter((field) => field in input);
  if (attemptedImmutable.length > 0) {
    throw new ValidationError(
      `No podés modificar el/los siguiente(s) campo(s): ${attemptedImmutable.join(', ')}.`
    );
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('Usuario no encontrado.');
  }

  const updates: Record<string, unknown> = {};

  if (input.country) {
    updates.country = input.country.toUpperCase();
  }

  if (input.username && input.username !== user.username) {
    if (user.usernameUpdatedAt) {
      const nextAllowedDate = new Date(user.usernameUpdatedAt);
      nextAllowedDate.setDate(nextAllowedDate.getDate() + USERNAME_COOLDOWN_DAYS);

      if (new Date() < nextAllowedDate) {
        const daysLeft = Math.ceil((nextAllowedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        throw new ValidationError(
          `Solo podés cambiar tu username cada ${USERNAME_COOLDOWN_DAYS} días. Podés volver a intentarlo en ${daysLeft} día(s).`
        );
      }
    }

    updates.username = input.username;
    updates.usernameUpdatedAt = new Date();
  }

  if (input.alias && input.alias !== user.alias) {
    updates.alias = input.alias;
  }

  try {
    await user.update(updates);
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.errors?.[0]?.path;
      const label = field === 'alias' ? 'alias' : 'username';
      throw new ConflictError(`Ese ${label} ya está en uso.`);
    }
    throw err;
  }

  return toProfile(user);
}
export async function updateTheme(userId: number, theme: 'light' | 'dark'): Promise<UserProfile> {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('Usuario no encontrado.');
  }

  await user.update({ theme });
  return toProfile(user);
}


function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    username: user.username as string,
    alias: user.alias as string,
    cbu: user.cbu,
    country: user.country,
    profilePictureUrl: user.profilePictureUrl,
    theme: user.theme,
  }


}

export async function deleteUserAccount(userId: number): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuario no encontrado.');
  const wallet = await Wallet.findOne({ where: { userId } });
  if (wallet) {
    const balances = await Balance.findAll({ where: { walletId: wallet.id } });

    // Verificamos si tiene saldo > 0 en alguna moneda
    const hasMoney = balances.some(b => Number(b.amount) > 0);
    if (hasMoney) {
      throw new ValidationError('No podés eliminar tu cuenta porque tenés saldo a favor. Transferilo o cambialo antes de darte de baja.');
    }
  }
  // Renombramos los campos únicos para que pueda volver a registrarse
  await user.update({
    email: `deleted_${user.id}_${user.email}`,
    username: null,
    alias: null,
    googleId: null,
    cbu: null
  });
  // Esto hace el soft-delete gracias al paranoid: true
  await user.destroy();
};
