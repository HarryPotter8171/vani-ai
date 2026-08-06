import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  categories,
  clearAll,
  create,
  exportAll,
  forget,
  getOne,
  getSettings,
  list,
  patchSettings,
  recall,
  remove,
  retrieve,
  summarize,
  update,
} from "../controllers/memoryController.js";

const router = express.Router();

router.use(requireAuth);

const memoryWriteLimit = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  message: "Too many memory writes. Please try again shortly.",
});

router.get("/settings", getSettings);
router.patch("/settings", memoryWriteLimit, patchSettings);

router.get("/categories", categories);
router.get("/export", exportAll);
router.get("/recall", recall);
router.get("/", list);
router.get("/:id", getOne);

router.post("/", memoryWriteLimit, create);
router.post("/forget", memoryWriteLimit, forget);
router.post("/retrieve", retrieve);
router.post("/summarize", memoryWriteLimit, summarize);
router.post("/clear", memoryWriteLimit, clearAll);

router.patch("/:id", memoryWriteLimit, update);
router.delete("/:id", memoryWriteLimit, remove);

export default router;
