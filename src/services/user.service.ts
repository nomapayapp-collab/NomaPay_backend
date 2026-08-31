// services/user.service.ts
import { User } from '../models/users.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';

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
}

const USERNAME_COOLDOWN_DAYS = 30;

// Campos que el usuario NUNCA puede modificar desde este endpoint.
// email/cbu: identificadores fijos. documentType/documentNumber: no editables por ahora.
const IMMUTABLE_FIELDS = ['email', 'cbu', 'documentType', 'documentNumber'] as const;

interface UpdateProfileInput {
  country?: string;
  username?: string;
  [key: string]: unknown; // para poder detectar campos no permitidos igual
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

  try {
    await user.update(updates);
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ConflictError('Ese username ya está en uso.');
    }
    throw err;
  }

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
  };
}