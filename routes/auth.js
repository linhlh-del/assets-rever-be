// routes/auth.js
import express from "express";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user }); // ← bỏ wrapper success/data
});
export default router;
