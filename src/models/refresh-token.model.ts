// models/refresh-token.model.ts
import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../db.js';

export class RefreshToken extends Model<
  InferAttributes<RefreshToken>,
  InferCreationAttributes<RefreshToken>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

RefreshToken.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, field: 'user_id', allowNull: false },
    tokenHash: { type: DataTypes.STRING(255), field: 'token_hash', allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, field: 'expires_at', allowNull: false },
    revokedAt: { type: DataTypes.DATE, field: 'revoked_at', allowNull: true },
    createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    timestamps: false,
    indexes: [{ fields: ['user_id'] }],
  }
);