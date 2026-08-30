import bcrypt from 'bcrypt';
import sequelize from '../db.js';
import { User } from '../models/users.model.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Currency } from '../models/currency.model.js';
import { ConflictError } from '../errors/app-error.js';

interface RegisterInput {
  name: string;
  surname: string;
  country: string;
  email: string;
  password: string;
}

export interface RegisterUserResult {
  id: number;
  name: string;
  surname: string;
  email: string;
  username: string;
  alias: string;
  cbu: string | null;
}

export async function registerUser(input: RegisterInput): Promise<RegisterUserResult> {
  const { name, surname, country, email, password } = input;

  const t = await sequelize.transaction();
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const usernameBase = `${name.trim()}.${surname.trim()}`
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .slice(0, 45);

    const username = usernameBase || `user${Date.now()}`;
    const alias = username;

    const user = await User.create(
      {
        name: name.trim(),
        surname: surname.trim(),
        country: country.toUpperCase(),
        email: email.toLowerCase().trim(),
        passwordHash,
        username,
        alias,
      },
      { transaction: t }
    );

    await user.reload({ transaction: t });

    const wallet = await Wallet.create(
      {
        userId: user.id,
        preferredCurrency: 'USD',
      },
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

    return {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      username: user.username as string,
      alias: user.alias as string,
      cbu: user.cbu,
    };
  } catch (err: any) {
    await t.rollback();

    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.errors?.[0]?.path;
      throw new ConflictError(`Ya existe una cuenta con ese ${field === 'email' ? 'email' : 'dato'}.`);
    }

    throw err;
  }
}
