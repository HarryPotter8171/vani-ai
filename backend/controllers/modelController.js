import {
  providerRegistry,
  modelRouter,
  getModelMetricsSnapshot,
  estimateCostUsd,
  estimateTokensFromText,
} from "../router/index.ts";

/** GET /api/models — catalog for the model selector UI. */
export async function listModels(req, res) {
  try {
    const includeDisabled = req.query.all === "1" || req.query.all === "true";
    const models = providerRegistry.listModels({
      configuredOnly: !includeDisabled,
    });
    const providers = providerRegistry.listProviders().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      configured: p.isConfigured(),
    }));

    res.json({
      models: models.map((m) => ({
        key: m.key,
        id: m.id,
        provider: m.provider,
        displayName: m.displayName,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        enabled: m.enabled,
      })),
      providers,
      defaults: {
        model: "gemini",
        autoRoute: process.env.VANI_AUTO_ROUTE === "true",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to list models" });
  }
}

/** GET /api/models/health — provider reachability snapshot. */
export async function getModelsHealth(_req, res) {
  try {
    const health = await providerRegistry.healthAll();
    res.json({ status: "ok", providers: health });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to check model health" });
  }
}

/** GET /api/models/metrics — in-process cost/token/latency aggregates. */
export async function getModelsMetrics(_req, res) {
  try {
    res.json(getModelMetricsSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load model metrics" });
  }
}

/** POST /api/models/route — preview auto-routing without calling a model. */
export async function previewRoute(req, res) {
  try {
    const { message, model, projectModel, requireVision } = req.body || {};
    const decision = modelRouter.resolve({
      model,
      projectModel,
      userMessage: message || "",
      requireVision: !!requireVision,
    });
    const estimateIn = estimateTokensFromText(message || "");
    const costPreview = estimateCostUsd({
      modelKey: decision.model.key,
      provider: decision.model.provider,
      inputTokens: estimateIn,
      outputTokens: Math.round(estimateIn * 0.6),
    });
    res.json({
      model: decision.model,
      reason: decision.reason,
      fallbacks: decision.fallbacks.map((m) => ({
        key: m.key,
        provider: m.provider,
        displayName: m.displayName,
      })),
      costPreviewUsd: costPreview,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to preview route" });
  }
}
