// services/contact.service.ts
import { Op } from 'sequelize';
import { Transaction } from '../models/transaction.model.js';
import { Wallet } from '../models/wallet.model.js';
import { User } from '../models/users.model.js';
import { NotFoundError } from '../errors/app-error.js';

export interface FrequentContact {
    id: number;
    alias: string | null;
    cbu: string | null;
    name: string;
    surname: string;
    profilePictureUrl: string | null;
    interactionCount: number;
}

export async function getFrequentContacts(userId: number): Promise<FrequentContact[]> {
    const myWallet = await Wallet.findOne({ where: { userId } });
    if (!myWallet) {
        throw new NotFoundError('Este usuario no tiene una wallet asociada.');
    }

    // 1. Buscamos todas las transferencias donde participamos
    const transfers = await Transaction.findAll({
        where: {
            type: 'transfer',
            status: 'completed',
            [Op.or]: [{ senderWalletId: myWallet.id }, { receiverWalletId: myWallet.id }],
        },
        attributes: ['senderWalletId', 'receiverWalletId'],
    });

    if (transfers.length === 0) return []; // Retorna vacío si no hay transacciones

    // 2. Contamos cuántas interacciones tuvimos con cada "otra wallet"
    const frequencyMap: Record<number, number> = {};

    for (const t of transfers) {
        const otherWalletId = t.senderWalletId === myWallet.id ? t.receiverWalletId : t.senderWalletId;
        if (otherWalletId) {
            frequencyMap[otherWalletId] = (frequencyMap[otherWalletId] || 0) + 1;
        }
    }

    // 3. Ordenamos por cantidad de interacciones (mayor a menor) y sacamos los 3 primeros IDs
    const topWalletIds = Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => Number(entry[0]));

    if (topWalletIds.length === 0) return [];

    // 4. Buscamos esas 3 wallets en la BD
    const topWallets = await Wallet.findAll({
        where: { id: { [Op.in]: topWalletIds } },
    });

    const userIds = topWallets.map(w => w.userId);

    // 5. Buscamos los datos de los usuarios (Sequelize ignora automáticamente a los que hicimos Soft Delete)
    const topUsers = await User.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: ['id', 'alias', 'cbu', 'name', 'surname', 'profilePictureUrl'],
    });

    // 6. Juntamos la info del usuario con su conteo de interacciones
    const result: FrequentContact[] = topWallets.map(wallet => {
        const user = topUsers.find(u => u.id === wallet.userId);
        if (!user) return null; // Si fue eliminado lógicamente, lo omitimos

        return {
            id: user.id,
            alias: user.alias || null,
            cbu: user.cbu || null,
            name: user.name,
            surname: user.surname,
            profilePictureUrl: user.profilePictureUrl || null,
            interactionCount: frequencyMap[wallet.id] || 0,
        };
    }).filter(contact => contact !== null) as FrequentContact[];

    // Ordenamos el array final para que queden de mayor a menor interacción
    return result.sort((a, b) => b.interactionCount - a.interactionCount);
}
