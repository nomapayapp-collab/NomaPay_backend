
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: "postgres",
    logging: false,
    dialectOptions: isProduction
        ? {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
        }
        : {},
});

export const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Conexión a la base de datos establecida correctamente");
    } catch (error) {
        console.error("❌ No se pudo conectar a la base de datos:", error);
        process.exit(1);
    }
};

export default sequelize;