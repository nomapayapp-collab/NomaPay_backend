
import app from "./src/app";
import { connectDB } from "./src/db";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
};

startServer();