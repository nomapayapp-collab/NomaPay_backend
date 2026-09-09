import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/users.model.js';
import { AppError } from '../errors/app-error.js';
import { sendPasswordResetEmail } from '../mails/mail.js';

export async function requestPasswordReset(email: string): Promise<void> {
    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    if (!user) {

        return;
    }


    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await user.update({
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: expiresAt
    });

    const resetLink = `${process.env.MAIL_SERVICE_URL}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user, resetLink);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await User.findOne({
        where: { resetPasswordToken: token }
    });

    if (!user || !user.resetPasswordTokenExpiresAt) {
        throw new AppError(400, 'El link es inválido o ya ha sido usado.');
    }

    if (new Date() > user.resetPasswordTokenExpiresAt) {
        throw new AppError(400, 'El link ha expirado. Por favor solicitá uno nuevo.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);


    await user.update({
        passwordHash,
        passwordChangedAt: new Date(),
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null
    });
}
