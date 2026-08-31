// balance.model.ts
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import  sequelize  from '../db.js';

export class Balance extends Model<InferAttributes<Balance>, InferCreationAttributes<Balance>> {
  declare id: CreationOptional<number>;
  declare walletId: number;
  declare currencyCode: string;
  declare amount: CreationOptional<string>; 
  declare updatedAt: CreationOptional<Date>;
}

Balance.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  walletId: {  
  type: DataTypes.INTEGER,
  field: 'wallet_id',
  allowNull: false,
  references: { model: 'wallets', key: 'id' },
},
  currencyCode: {  
  type: DataTypes.STRING(10),
  field: 'currency_code',
  allowNull: false,
  references: { model: 'currencies', key: 'code' },
},
  amount: { type: DataTypes.DECIMAL(20, 8), defaultValue: 0 },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
},
{ sequelize, 
  tableName: 'balances',
  timestamps: false ,
  indexes: [
    { unique: true, fields: ['wallet_id', 'currency_code'] },
  ],

});