
import { Op } from 'sequelize';
import { Transaction } from '../models/transaction.model.js';
import { Wallet } from '../models/wallet.model.js';
import { User } from '../models/users.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';

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

  
    const transfers = await Transaction.findAll({
        where: {
            type: 'transfer',
            status: 'completed',
            [Op.or]: [{ senderWalletId: myWallet.id }, { receiverWalletId: myWallet.id }],
        },
        attributes: ['senderWalletId', 'receiverWalletId'],
    });

    if (transfers.length === 0) return []; 

   
    const frequencyMap: Record<number, number> = {};

    for (const t of transfers) {
        const otherWalletId = t.senderWalletId === myWallet.id ? t.receiverWalletId : t.senderWalletId;
        if (otherWalletId) {
            frequencyMap[otherWalletId] = (frequencyMap[otherWalletId] || 0) + 1;
        }
    }

     const topWalletIds = Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => Number(entry[0]));

    if (topWalletIds.length === 0) return [];

    
    const topWallets = await Wallet.findAll({
        where: { id: { [Op.in]: topWalletIds } },
    });

    const userIds = topWallets.map(w => w.userId);

     const topUsers = await User.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: ['id', 'alias', 'cbu', 'name', 'surname', 'profilePictureUrl'],
    });

     const result: FrequentContact[] = topWallets.map(wallet => {
        const user = topUsers.find(u => u.id === wallet.userId);
        if (!user) return null; 

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

     return result.sort((a, b) => b.interactionCount - a.interactionCount);
}

export interface ContactLookupResult {
    alias: string | null;
    cbu: string | null;
    name: string;
    surname: string;
    profilePictureUrl: string | null;
    isSelf: boolean;
}


export async function lookupContactByAliasOrCbu(userId: number, aliasOrCbu: string): Promise<ContactLookupResult> {
    const query = (aliasOrCbu ?? '').trim();

    if (!query) {
        throw new ValidationError('Debés indicar un alias o CBU para buscar.');
    }

    const user = await User.findOne({
        where: {
            [Op.or]: [{ alias: query }, { cbu: query }],
        },
        attributes: ['id', 'alias', 'cbu', 'name', 'surname', 'profilePictureUrl'],
    });

    if (!user) {
        throw new NotFoundError('No se encontró ningún usuario con ese alias o CBU.');
    }

    return {
        alias: user.alias || null,
        cbu: user.cbu || null,
        name: user.name,
        surname: user.surname,
        profilePictureUrl: user.profilePictureUrl || null,
        isSelf: user.id === userId,
    };
}