import Elysia, { t } from "elysia";
import { publish } from "../clients/ntfy.js";

type Priority = 1 | 2 | 3 | 4 | 5;

const TOPIC = process.env.NTFY_TOPIC ?? "claude-remote";

export const notifyRoute = new Elysia().post(
  "/api/notify",
  async ({ body }) => {
    await publish(TOPIC, body.title ?? "ClaudeRemote", body.message, body.priority as Priority | undefined);
    return { ok: true };
  },
  {
    body: t.Object({
      message: t.String(),
      title: t.Optional(t.String()),
      priority: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
    }),
    response: t.Object({ ok: t.Literal(true) }),
    detail: {
      summary: "Send an NTFY notification",
      tags: ["Notify"],
      security: [{ BearerAuth: [] }],
    },
  },
);
