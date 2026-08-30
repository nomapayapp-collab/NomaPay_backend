import { Router } from "express";
import authRoutes from "./auth.routes.js"; 
import loginRoutes from "./login.routes.js";
import userRoutes from "./user.routes.js";

const router = Router();


router.use("/auth", authRoutes);
router.use("/auth", loginRoutes);
router.use("/users", userRoutes);

export default router;