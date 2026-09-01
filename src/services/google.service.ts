
import { OAuth2Client } from 'google-auth-library';
import sequelize from '../db.js';
import { User } from '../models/users.model.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Currency } from '../models/currency.model.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { issueTokenPair } from './token.service.js';
import type { AuthResult } from './login.service.js';
import type { RegisterUserResult } from './auth.service.js';

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): { client: OAuth2Client; clientId: string } {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (typeof googleClientId !== 'string' || googleClientId.length === 0) {
    throw new AppError(503, 'El login con Google no está disponible: falta configurar GOOGLE_CLIENT_ID.');
  }

  if (!googleClient) {
    googleClient = new OAuth2Client(googleClientId);
  }

  return { client: googleClient, clientId: googleClientId };
}

interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  surname: string;
  profilePictureUrl: string | null;
}

async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  const { client, clientId } = getGoogleClient();

  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
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
  let committed = false;

  try {
    const newUser = await User.create(
      {
        name: name.trim(),
        surname: surname.trim(),
        email,
        googleId,
        profilePictureUrl,
        emailVerifiedAt: new Date(),
        // username y alias: los generan los triggers de la base (con manejo de colisiones)
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
    committed = true;

    const { accessToken, refreshToken } = await issueTokenPair(newUser.id, newUser.email);
    return { accessToken, refreshToken, user: toResult(newUser) };
  } catch (err: any) {
    if (!committed) {
      await t.rollback();
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.errors?.[0]?.path;
      throw new ConflictError(`Ya existe una cuenta con ese ${field === 'email' ? 'email' : 'dato'}.`);
    }
    throw err;
  }
}


export async function loginWithGoogle(idToken: string): Promise<AuthResult> {
  const { googleId, email, profilePictureUrl } = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({ where: { googleId } });

  if (!user) {
    user = await User.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundError('No existe una cuenta con este email. Registrate primero.');
    }

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