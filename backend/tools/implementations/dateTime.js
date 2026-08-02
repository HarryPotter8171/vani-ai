import { getCurrentDateTime } from "../datetools.js";

export const dateTimeTool = {
  id: "current_datetime",
  name: "current_datetime",
  displayName: "Current Date & Time",
  description:
    "Get the current date and time. Use for 'today', 'what time is it', scheduling, or any time-sensitive answer. Defaults to Asia/Kolkata (IST) unless another IANA timezone is provided.",
  schema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone, e.g. Asia/Kolkata, America/New_York, UTC",
      },
    },
    additionalProperties: false,
  },
  async execute(args = {}) {
    const timezone = args.timezone || "Asia/Kolkata";
    try {
      const now = new Date();
      const full = new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);

      return {
        ok: true,
        timezone,
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        full,
        date: new Intl.DateTimeFormat("en-IN", {
          timeZone: timezone,
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(now),
        time: new Intl.DateTimeFormat("en-IN", {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(now),
        // Keep legacy helper for IST default parity
        ist: timezone === "Asia/Kolkata" ? getCurrentDateTime() : undefined,
      };
    } catch {
      return {
        ok: false,
        error: `Invalid timezone: ${timezone}`,
      };
    }
  },
};
