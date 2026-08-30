
import express from "express";
import type { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import mainRouter from "./routes/index.js";

const app: Application = express();


app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/", (req: Request, res: Response) => {
    res.json({ message: "NomaPay backend funcionando 🚀" });
});

app.use("/api", mainRouter);


app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Ruta no encontrada" });
});


app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "Error interno del servidor" });
});

export default app;
