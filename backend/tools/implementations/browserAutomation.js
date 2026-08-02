export const browserAutomationTool = {
  id: "browser_automation",
  name: "browser_automation",
  displayName: "Browser Automation",
  description:
    "Automate browsing tasks such as opening pages and extracting visible content. Currently future-ready — not enabled in production yet.",
  future: true,
  enabled: process.env.VANI_ENABLE_BROWSER_AUTOMATION === "true",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["open", "extract", "screenshot"],
        description: "Browser action to perform",
      },
      url: {
        type: "string",
        description: "Target URL",
      },
      instruction: {
        type: "string",
        description: "What to extract or accomplish on the page",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  async execute() {
    return {
      ok: false,
      future: true,
      error:
        "Browser automation is registered but not enabled yet. It will be available in a future release.",
    };
  },
};
