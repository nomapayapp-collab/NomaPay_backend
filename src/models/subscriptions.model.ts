// subscription.model.ts
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../db.js';

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

export class Subscription extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare plan: CreationOptional<string>;
  declare status: CreationOptional<SubscriptionStatus>;
  declare startedAt: CreationOptional<Date>;
  declare expiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

Subscription.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, field: 'user_id', allowNull: false, unique: true },
    plan: { type: DataTypes.STRING(50), defaultValue: 'premium' },
    status: {
      type: DataTypes.ENUM('active', 'cancelled', 'expired'),
      defaultValue: 'active',
    },
    startedAt: { type: DataTypes.DATE, field: 'started_at', defaultValue: DataTypes.NOW },
    expiresAt: { type: DataTypes.DATE, field: 'expires_at', allowNull: true },
    createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'subscriptions',
    timestamps: false,
  }
);