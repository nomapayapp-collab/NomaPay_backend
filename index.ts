
import app from "./src/app.js";
import { connectDB } from "./src/db.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
};

startServer();
