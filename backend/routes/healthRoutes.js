import express from "express";
import { getHealth, getReady, getVersion } from "../controllers/healthController.js";

const router = express.Router();

// Intentionally unauthenticated — consumed by load balancers, container
// orchestrators (k8s liveness/readiness probes), and uptime monitors.
router.get("/health", getHealth);
router.get("/ready", getReady);
router.get("/version", getVersion);

export default router;
