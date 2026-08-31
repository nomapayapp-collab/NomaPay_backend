import { Router } from "express";
import authRoutes from "./auth.routes.js";
import loginRoutes from "./login.routes.js";
import tokenRoutes from "./token.routes.js";
import googleRoutes from "./google.routes.js";
import userRoutes from "./user.routes.js";
import walletRoutes from "./wallet.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/auth", loginRoutes);
router.use("/auth", tokenRoutes);
router.use("/auth", googleRoutes);
router.use("/users", userRoutes);
router.use("/wallets", walletRoutes);

export default router;