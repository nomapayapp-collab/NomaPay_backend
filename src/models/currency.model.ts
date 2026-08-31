
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../db.js';

export class Currency extends Model<InferAttributes<Currency>, InferCreationAttributes<Currency>> {
  declare code: string;
  declare name: string;
  declare symbol: string | null;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
}

Currency.init(
  {
    code: { type: DataTypes.STRING(10), primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    symbol: { type: DataTypes.STRING(5), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, field: 'is_active', defaultValue: true },
    createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'currencies',
    timestamps: false,
  }
);