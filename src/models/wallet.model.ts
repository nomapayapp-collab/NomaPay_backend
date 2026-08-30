// wallet.model.ts
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import  sequelize  from '../db.js';

export class Wallet extends Model<InferAttributes<Wallet>, InferCreationAttributes<Wallet>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare createdAt: CreationOptional<Date>;
  declare preferredCurrency: CreationOptional<string>;
}

Wallet.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, field: 'user_id', allowNull: false, unique: true },
  createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
  preferredCurrency: { type: DataTypes.STRING(10), field: 'preferred_currency', defaultValue: 'USD' },
}, { sequelize, tableName: 'wallets', timestamps: false });