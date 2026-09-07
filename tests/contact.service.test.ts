
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/models/wallet.model.js', () => ({
  Wallet: { findOne: vi.fn(), findAll: vi.fn() },
}));

vi.mock('../src/models/transaction.model.js', () => ({
  Transaction: { findAll: vi.fn() },
}));

vi.mock('../src/models/users.model.js', () => ({
  User: { findAll: vi.fn() },
}));

const { Wallet } = await import('../src/models/wallet.model.js');
const { Transaction } = await import('../src/models/transaction.model.js');
const { User } = await import('../src/models/users.model.js');

const { getFrequentContacts } = await import('../src/services/contact.service.js');

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

    // Simulamos transacciones:
    // Wallet 20: 3 interacciones (2 enviadas, 1 recibida)
    // Wallet 30: 2 interacciones (2 recibidas)
    // Wallet 40: 1 interacción (1 enviada)
    // Wallet 50: 1 interacción (1 enviada) -> no entra en el top 3
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

    // Solo encontramos al usuario 2 (el 3 fue soft-deleted)
    (User.findAll as any).mockResolvedValue([
      { id: 2, alias: 'maria.gomez', cbu: '000222', name: 'María', surname: 'Gómez', profilePictureUrl: null },
    ]);

    const result = await getFrequentContacts(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(2);
  });
});
