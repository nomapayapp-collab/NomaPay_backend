// transaction.model.ts
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../db.js';

export type TransactionType = 'buy' | 'sell' | 'transfer' | 'exchange';
export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'rejected';

export class Transaction extends Model<InferAttributes<Transaction>, InferCreationAttributes<Transaction>> {
  declare id: CreationOptional<number>;
  declare senderWalletId: number;
  declare receiverWalletId: number | null;
  declare type: TransactionType;
  declare status: CreationOptional<TransactionStatus>;
  declare currencyOrigin: string;
  declare currencyDestination: string | null;
  declare amount: string;
  declare fee: CreationOptional<string>;
  declare finalAmount: string | null;
  declare exchangeRate: string | null;
  declare transactionDate: CreationOptional<Date>;
}

Transaction.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    senderWalletId: { type: DataTypes.INTEGER, field: 'sender_wallet_id', allowNull: false },
    receiverWalletId: { type: DataTypes.INTEGER, field: 'receiver_wallet_id', allowNull: true },
    type: { type: DataTypes.ENUM('buy', 'sell', 'transfer', 'exchange'), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'rejected'),
      defaultValue: 'pending',
    },
    currencyOrigin: { type: DataTypes.STRING(10), field: 'currency_origin', allowNull: false },
    currencyDestination: { type: DataTypes.STRING(10), field: 'currency_destination', allowNull: true },
    amount: { type: DataTypes.DECIMAL(20, 8), allowNull: false },
    fee: { type: DataTypes.DECIMAL(20, 8), defaultValue: 0 },
    finalAmount: { type: DataTypes.DECIMAL(20, 8), field: 'final_amount', allowNull: true },
    exchangeRate: { type: DataTypes.DECIMAL(20, 8), field: 'exchange_rate', allowNull: true },
    transactionDate: { type: DataTypes.DATE, field: 'transaction_date', defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'transactions',
    timestamps: false,
    indexes: [
      { fields: ['sender_wallet_id'] },
      { fields: ['receiver_wallet_id'] },
      { fields: ['status'] },
      { fields: ['transaction_date'] },
    ],
  }
);