// services/password.service.ts
import bcrypt from 'bcrypt';
import { User } from '../models/users.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
  const { currentPassword, newPassword } = input;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('Usuario no encontrado.');
  }


  if (!user.passwordHash) {
    throw new ValidationError(
      'Esta cuenta no tiene contraseña propia (se registró con Google). No se puede cambiar.'
    );
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new ValidationError('La contraseña actual es incorrecta.');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await user.update({
    passwordHash: newPasswordHash,
    passwordChangedAt: new Date(),
  });
}