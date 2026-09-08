import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Op } from 'sequelize';

vi.mock('../src/models/wallet.model.js', () => ({
  Wallet: { findOne: vi.fn(), findAll: vi.fn() },
}));

vi.mock('../src/models/transaction.model.js', () => ({
  Transaction: { findAll: vi.fn() },
}));

vi.mock('../src/models/users.model.js', () => ({
  User: { findAll: vi.fn(), findOne: vi.fn() },
}));

const { Wallet } = await import('../src/models/wallet.model.js');
const { Transaction } = await import('../src/models/transaction.model.js');
const { User } = await import('../src/models/users.model.js');

const { getFrequentContacts, lookupContactByAliasOrCbu } = await import('../src/services/contact.service.js');

const USER_ID = 1;
const MY_WALLET = { id: 10, userId: USER_ID };

describe('contact.service — getFrequentContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza NotFoundError si el usuario no tiene una wallet asociada', async () => {
    (Wallet.findOne as any).mockResolvedValue(null);

    await expect(getFrequentContacts(USER_ID)).rejects.toThrow(
      'Este usuario no tiene una wallet asociada.'
    );
  });

  it('retorna un array vacío si el usuario no tiene transferencias', async () => {
    (Wallet.findOne as any).mockResolvedValue(MY_WALLET);
    (Transaction.findAll as any).mockResolvedValue([]);

    const result = await getFrequentContacts(USER_ID);

    expect(result).toEqual([]);
    expect(Wallet.findAll).not.toHaveBeenCalled();
    expect(User.findAll).not.toHaveBeenCalled();
  });

  it('devuelve hasta 3 contactos frecuentes ordenados de mayor a menor cantidad de interacciones', async () => {
    (Wallet.findOne as any).mockResolvedValue(MY_WALLET);


    (Transaction.findAll as any).mockResolvedValue([
      { senderWalletId: MY_WALLET.id, receiverWalletId: 20 },
      { senderWalletId: MY_WALLET.id, receiverWalletId: 20 },
      { senderWalletId: 20, receiverWalletId: MY_WALLET.id },
      { senderWalletId: 30, receiverWalletId: MY_WALLET.id },
      { senderWalletId: 30, receiverWalletId: MY_WALLET.id },
      { senderWalletId: MY_WALLET.id, receiverWalletId: 40 },
      { senderWalletId: MY_WALLET.id, receiverWalletId: 50 },
    ]);

    (Wallet.findAll as any).mockResolvedValue([
      { id: 20, userId: 2 },
      { id: 30, userId: 3 },
      { id: 40, userId: 4 },
    ]);

    (User.findAll as any).mockResolvedValue([
      { id: 2, alias: 'maria.gomez', cbu: '000222', name: 'María', surname: 'Gómez', profilePictureUrl: 'https://img.com/maria.png' },
      { id: 3, alias: 'juan.perez', cbu: null, name: 'Juan', surname: 'Pérez', profilePictureUrl: null },
      { id: 4, alias: null, cbu: '000444', name: 'Carlos', surname: 'López', profilePictureUrl: null },
    ]);

    const result = await getFrequentContacts(USER_ID);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: 2,
      alias: 'maria.gomez',
      cbu: '000222',
      name: 'María',
      surname: 'Gómez',
      profilePictureUrl: 'https://img.com/maria.png',
      interactionCount: 3,
    });
    expect(result[1]).toEqual({
      id: 3,
      alias: 'juan.perez',
      cbu: null,
      name: 'Juan',
      surname: 'Pérez',
      profilePictureUrl: null,
      interactionCount: 2,
    });
    expect(result[2]).toEqual({
      id: 4,
      alias: null,
      cbu: '000444',
      name: 'Carlos',
      surname: 'López',
      profilePictureUrl: null,
      interactionCount: 1,
    });
  });

  it('omite contactos cuyo usuario no fue encontrado (ej. eliminado)', async () => {
    (Wallet.findOne as any).mockResolvedValue(MY_WALLET);
    (Transaction.findAll as any).mockResolvedValue([
      { senderWalletId: MY_WALLET.id, receiverWalletId: 20 },
      { senderWalletId: MY_WALLET.id, receiverWalletId: 30 },
    ]);

    (Wallet.findAll as any).mockResolvedValue([
      { id: 20, userId: 2 },
      { id: 30, userId: 3 },
    ]);

   
    (User.findAll as any).mockResolvedValue([
      { id: 2, alias: 'maria.gomez', cbu: '000222', name: 'María', surname: 'Gómez', profilePictureUrl: null },
    ]);

    const result = await getFrequentContacts(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(2);
  });
});

describe('contact.service — lookupContactByAliasOrCbu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza ValidationError si no se manda alias/cbu', async () => {
    await expect(lookupContactByAliasOrCbu(USER_ID, '')).rejects.toThrow(
      'Debés indicar un alias o CBU para buscar.'
    );
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('lanza ValidationError si el alias/cbu es solo espacios', async () => {
    await expect(lookupContactByAliasOrCbu(USER_ID, '   ')).rejects.toThrow(
      'Debés indicar un alias o CBU para buscar.'
    );
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('lanza NotFoundError si no existe ningún usuario con ese alias o CBU', async () => {
    (User.findOne as any).mockResolvedValue(null);

    await expect(lookupContactByAliasOrCbu(USER_ID, 'no.existe')).rejects.toThrow(
      'No se encontró ningún usuario con ese alias o CBU.'
    );
  });

  it('devuelve los datos del contacto cuando el alias existe', async () => {
    (User.findOne as any).mockResolvedValue({
      id: 2,
      alias: 'maria.gomez',
      cbu: '0000003100012345678902',
      name: 'María',
      surname: 'Gómez',
      profilePictureUrl: 'https://img.com/maria.png',
    });

    const result = await lookupContactByAliasOrCbu(USER_ID, 'maria.gomez');

    expect(result).toEqual({
      alias: 'maria.gomez',
      cbu: '0000003100012345678902',
      name: 'María',
      surname: 'Gómez',
      profilePictureUrl: 'https://img.com/maria.png',
      isSelf: false,
    });
  });

  it('busca también por CBU y no solo por alias', async () => {
    (User.findOne as any).mockResolvedValue({
      id: 3,
      alias: null,
      cbu: '0000003100012345678902',
      name: 'Juan',
      surname: 'Pérez',
      profilePictureUrl: null,
    });

    const result = await lookupContactByAliasOrCbu(USER_ID, '0000003100012345678902');

    expect(result?.cbu).toBe('0000003100012345678902');
    expect(result?.alias).toBeNull();
  });

  it('recorta espacios del alias/cbu antes de buscar', async () => {
    (User.findOne as any).mockResolvedValue({
      id: 2,
      alias: 'maria.gomez',
      cbu: null,
      name: 'María',
      surname: 'Gómez',
      profilePictureUrl: null,
    });

    await lookupContactByAliasOrCbu(USER_ID, '  maria.gomez  ');

    const [{ where }] = (User.findOne as any).mock.calls[0];
    const orConditions = where[Op.or];
    expect(orConditions).toEqual([{ alias: 'maria.gomez' }, { cbu: 'maria.gomez' }]);
  });

  it('marca isSelf en true si el usuario se busca a sí mismo', async () => {
    (User.findOne as any).mockResolvedValue({
      id: USER_ID,
      alias: 'yo.mismo',
      cbu: null,
      name: 'Gisella',
      surname: 'Dev',
      profilePictureUrl: null,
    });

    const result = await lookupContactByAliasOrCbu(USER_ID, 'yo.mismo');

    expect(result.isSelf).toBe(true);
  });
});