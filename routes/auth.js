// routes/auth.js
import express from "express";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/me", authenticate, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

export default router;
