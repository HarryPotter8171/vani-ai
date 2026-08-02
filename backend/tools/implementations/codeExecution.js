export const codeExecutionTool = {
  id: "code_execution",
  name: "code_execution",
  displayName: "Code Execution",
  description:
    "Execute short code snippets in a sandboxed environment. Currently future-ready — not enabled in production yet.",
  future: true,
  enabled: process.env.VANI_ENABLE_CODE_EXECUTION === "true",
  schema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["javascript", "python"],
        description: "Language to execute",
      },
      code: {
        type: "string",
        description: "Source code to run",
      },
    },
    required: ["language", "code"],
    additionalProperties: false,
  },
  async execute() {
    return {
      ok: false,
      future: true,
      error:
        "Code execution is registered but not enabled yet. It will run in a secure sandbox in a future release.",
    };
  },
};
