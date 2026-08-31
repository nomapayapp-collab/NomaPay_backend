// services/google.service.ts
import { OAuth2Client } from 'google-auth-library';
import sequelize from '../db.js';
import { User } from '../models/users.model.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Currency } from '../models/currency.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { issueTokenPair } from './token.service.js';
import type { AuthResult } from './login.service.js';
import type { RegisterUserResult } from './auth.service.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  surname: string;
  profilePictureUrl: string | null;
}

async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new ValidationError('Token de Google inválido.');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.given_name ?? 'Usuario',
    surname: payload.family_name ?? 'NomaPay',
    profilePictureUrl: payload.picture ?? null,
  };
}

/**
 * Registro con Google: crea una cuenta nueva.
 * Falla si ya existe un usuario con ese google_id o ese email.
 */
export async function registerWithGoogle(idToken: string): Promise<AuthResult> {
  const { googleId, email, name, surname, profilePictureUrl } = await verifyGoogleIdToken(idToken);

  const existingByGoogleId = await User.findOne({ where: { googleId } });
  if (existingByGoogleId) {
    throw new ConflictError('Ya existe una cuenta registrada con esta cuenta de Google.');
  }

  const existingByEmail = await User.findOne({ where: { email } });
  if (existingByEmail) {
    throw new ConflictError('Ya existe una cuenta con este email. Iniciá sesión en vez de registrarte.');
  }

  const t = await sequelize.transaction();
  try {
    const usernameBase = `${name.trim()}.${surname.trim()}`
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .slice(0, 45);

    const username = usernameBase || `user${Date.now()}`;

    const newUser = await User.create(
      {
        name: name.trim(),
        surname: surname.trim(),
        email,
        googleId,
        profilePictureUrl,
        username,
        alias: username,
        emailVerifiedAt: new Date(), // Google ya verificó el email por nosotros
      },
      { transaction: t }
    );

    await newUser.reload({ transaction: t });

    const wallet = await Wallet.create(
      { userId: newUser.id, preferredCurrency: 'USD' },
      { transaction: t }
    );

    const activeCurrencies = await Currency.findAll({ where: { isActive: true }, transaction: t });

    await Balance.bulkCreate(
      activeCurrencies.map((c) => ({
        walletId: wallet.id,
        currencyCode: c.code,
        amount: '0',
      })),
      { transaction: t }
    );

    await t.commit();

    const { accessToken, refreshToken } = await issueTokenPair(newUser.id, newUser.email);
    return { accessToken, refreshToken, user: toResult(newUser) };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Login con Google: entra a una cuenta EXISTENTE.
 * Falla si no existe ningún usuario con ese google_id ni ese email.
 * Si existe un usuario registrado de forma normal (con password) con
 * este mismo email, vincula la cuenta de Google en vez de fallar.
 */
export async function loginWithGoogle(idToken: string): Promise<AuthResult> {
  const { googleId, email, profilePictureUrl } = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({ where: { googleId } });

  if (!user) {
    user = await User.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundError('No existe una cuenta con este email. Registrate primero.');
    }

    // Cuenta creada con email/password que todavía no estaba vinculada a Google.
    await user.update({ googleId, profilePictureUrl: user.profilePictureUrl ?? profilePictureUrl });
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
  return { accessToken, refreshToken, user: toResult(user) };
}

function toResult(user: User): RegisterUserResult {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    username: user.username as string,
    alias: user.alias as string,
    cbu: user.cbu,
  };
}