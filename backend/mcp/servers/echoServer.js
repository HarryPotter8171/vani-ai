/**
 * Minimal standards-compliant Echo MCP server (stdio) for verification.
 * Tools: echo, ping
 * Resources: echo://last
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

let lastEcho = "";

const server = new Server(
  { name: "vani-echo-mcp", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo back a message (VANI MCP verification tool)",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to echo" },
        },
        required: ["message"],
      },
    },
    {
      name: "ping",
      description: "Health ping — returns pong",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = /** @type {Record<string, unknown>} */ (request.params.arguments || {});

  if (name === "echo") {
    const message = String(args.message ?? "");
    lastEcho = message;
    return {
      content: [{ type: "text", text: message }],
    };
  }

  if (name === "ping") {
    return {
      content: [{ type: "text", text: "pong" }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "echo://last",
      name: "Last echo",
      description: "The most recent echoed message",
      mimeType: "text/plain",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== "echo://last") {
    throw new Error(`Unknown resource: ${request.params.uri}`);
  }
  return {
    contents: [
      {
        uri: "echo://last",
        mimeType: "text/plain",
        text: lastEcho || "(empty)",
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
