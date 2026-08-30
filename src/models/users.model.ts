import { DataTypes, Model } from 'sequelize'
import type { Optional } from 'sequelize';
import sequelize from '../db.js';

// Atributos de la tabla
interface UserAttributes {
  id: number;
  name: string;
  surname: string;
  documentType?: string | null;
  documentNumber?: string | null;
  email: string;
  country: string;
  passwordHash: string;
  username?: string | null;
  usernameUpdatedAt?: Date | null;
  alias?: string | null;
  cbu?: string | null;
  profilePictureUrl?: string | null;
  createdAt?: Date;
  passwordChangedAt?: Date | null;
  resetPasswordToken?: string | null;
  resetPasswordTokenExpiresAt?: Date | null;
  isAdmin?: boolean;
  emailVerifiedAt?: Date | null;
  kycStatus?: 'not_started' | 'pending' | 'approved' | 'rejected';
  kycReviewedAt?: Date | null;
}


interface UserCreationAttributes extends Optional<UserAttributes, 
  'id' | 'documentType' | 'documentNumber' | 'username' | 'usernameUpdatedAt' | 
  'alias' | 'cbu' | 'profilePictureUrl' | 'createdAt' | 'passwordChangedAt' | 
  'resetPasswordToken' | 'resetPasswordTokenExpiresAt' | 'isAdmin' | 
  'emailVerifiedAt' | 'kycStatus' | 'kycReviewedAt'
> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare name: string;
  declare surname: string;
  declare documentType: string | null;
  declare documentNumber: string | null;
  declare email: string;
  declare country: string;
  declare passwordHash: string;
  declare username: string | null;
  declare usernameUpdatedAt: Date | null;
  declare alias: string | null;
  declare cbu: string | null;
  declare profilePictureUrl: string | null;
  declare createdAt: Date;
  declare passwordChangedAt: Date | null;
  declare resetPasswordToken: string | null;
  declare resetPasswordTokenExpiresAt: Date | null;
  declare isAdmin: boolean;
  declare emailVerifiedAt: Date | null;
  declare kycStatus: 'not_started' | 'pending' | 'approved' | 'rejected';
  declare kycReviewedAt: Date | null;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    surname: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    documentType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'document_type',
    },
    documentNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'document_number',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: true, 
      unique: true,
    },
    usernameUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'username_updated_at',
    },
    alias: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    cbu: {
      type: DataTypes.STRING(22),
      allowNull: true,
      unique: true,
      validate: { is: /^[0-9]{22}$/ },
    },
    profilePictureUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'profile_picture_url',
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'password_changed_at',
    },
    resetPasswordToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reset_password_token',
    },
    resetPasswordTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reset_password_token_expires_at',
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_admin',
    },
    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'email_verified_at',
    },
    kycStatus: {
      type: DataTypes.ENUM('not_started', 'pending', 'approved', 'rejected'),
      defaultValue: 'not_started',
      field: 'kyc_status',
    },
    kycReviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'kyc_reviewed_at',
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: false,
    indexes: [
    { unique: true, fields: ['document_type', 'document_number'] },
  ],
  }
);