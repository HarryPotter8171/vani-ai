import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listModels,
  getModelsHealth,
  getModelsMetrics,
  previewRoute,
} from "../controllers/modelController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", listModels);
router.get("/health", getModelsHealth);
router.get("/metrics", getModelsMetrics);
router.post("/route", previewRoute);

export default router;
