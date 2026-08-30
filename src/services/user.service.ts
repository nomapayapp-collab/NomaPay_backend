// services/user.service.ts
import { User } from '../models/users.model.js';
import { NotFoundError } from '../errors/app-error.js';

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

export async function getUserProfile(userId: number): Promise<UserProfile> {
  const user = await User.findByPk(userId);

  if (!user) {
    throw new NotFoundError('Usuario no encontrado.');
  }

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