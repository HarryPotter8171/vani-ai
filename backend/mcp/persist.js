/**
 * Mongo persistence adapters for MCPManager + MCPPermissionManager.
 */

import McpServer from "../models/McpServer.js";
import McpPermission from "../models/McpPermission.js";

function mapToObject(mapOrObj) {
  if (!mapOrObj) return undefined;
  if (mapOrObj instanceof Map) {
    return Object.fromEntries(mapOrObj.entries());
  }
  if (typeof mapOrObj === "object") return { ...mapOrObj };
  return undefined;
}

function docToConfig(doc) {
  const transport = doc.transport?.toObject
    ? doc.transport.toObject()
    : { ...doc.transport };

  const config = {
    id: String(doc._id),
    userId: String(doc.user),
    name: doc.name,
    description: doc.description || undefined,
    enabled: doc.enabled !== false,
    transport: {
      type: transport.type,
      ...(transport.command ? { command: transport.command } : {}),
      ...(transport.args ? { args: transport.args } : {}),
      ...(transport.env ? { env: mapToObject(transport.env) } : {}),
      ...(transport.cwd ? { cwd: transport.cwd } : {}),
      ...(transport.url ? { url: transport.url } : {}),
      ...(transport.headers ? { headers: mapToObject(transport.headers) } : {}),
    },
    timeoutMs: doc.timeoutMs,
    autoReconnect: doc.autoReconnect,
    maxReconnectAttempts: doc.maxReconnectAttempts,
    createdAt: doc.createdAt?.toISOString?.() || undefined,
    updatedAt: doc.updatedAt?.toISOString?.() || undefined,
  };
  return config;
}

export async function listServers(userId) {
  const docs = await McpServer.find({ user: userId }).sort({ createdAt: 1 }).lean(false);
  return docs.map(docToConfig);
}

function isObjectId(value) {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value)
  );
}

export async function saveServer(config) {
  const payload = {
    user: config.userId,
    name: config.name,
    description: config.description || "",
    enabled: config.enabled !== false,
    transport: config.transport,
    timeoutMs: config.timeoutMs,
    autoReconnect: config.autoReconnect,
    maxReconnectAttempts: config.maxReconnectAttempts,
  };

  let doc;
  if (config.id && isObjectId(config.id)) {
    doc = await McpServer.findOneAndUpdate(
      { _id: config.id, user: config.userId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!doc) {
      doc = await McpServer.create({ _id: config.id, ...payload });
    }
  } else {
    doc = await McpServer.create(payload);
  }

  return docToConfig(doc);
}

export async function deleteServer(userId, serverId) {
  const result = await McpServer.deleteOne({ _id: serverId, user: userId });
  return result.deletedCount > 0;
}

export function createMongoPermissionStore() {
  return {
    async get(userId, serverId) {
      const doc = await McpPermission.findOne({ user: userId, serverId });
      if (!doc) return null;
      return {
        userId: String(doc.user),
        serverId: doc.serverId,
        trusted: Boolean(doc.trusted),
        allowedTools: doc.allowedTools || [],
        deniedTools: doc.deniedTools || [],
        updatedAt: doc.updatedAt?.toISOString?.(),
      };
    },

    async set(record) {
      const doc = await McpPermission.findOneAndUpdate(
        { user: record.userId, serverId: record.serverId },
        {
          $set: {
            trusted: Boolean(record.trusted),
            allowedTools: record.allowedTools || [],
            deniedTools: record.deniedTools || [],
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return {
        userId: String(doc.user),
        serverId: doc.serverId,
        trusted: Boolean(doc.trusted),
        allowedTools: doc.allowedTools || [],
        deniedTools: doc.deniedTools || [],
        updatedAt: doc.updatedAt?.toISOString?.(),
      };
    },

    async list(userId) {
      const docs = await McpPermission.find({ user: userId });
      return docs.map((doc) => ({
        userId: String(doc.user),
        serverId: doc.serverId,
        trusted: Boolean(doc.trusted),
        allowedTools: doc.allowedTools || [],
        deniedTools: doc.deniedTools || [],
        updatedAt: doc.updatedAt?.toISOString?.(),
      }));
    },

    async remove(userId, serverId) {
      const result = await McpPermission.deleteOne({ user: userId, serverId });
      return result.deletedCount > 0;
    },
  };
}
