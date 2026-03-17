import { Elysia } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { swagger } from "@elysiajs/swagger";
import { initTickTickClient } from "./clients/ticktick.js";
import { healthRoute } from "./routes/health.js";
import { ticktickAuthRoutes } from "./routes/ticktick-auth.js";
import { notifyRoute } from "./routes/notify.js";
import { ticktickRoutes } from "./routes/ticktick.js";
import { registerCronJobs } from "./cron/index.js";

await initTickTickClient();

const SECRET = process.env.CLAUDE_REMOTE_API_SECRET;

const authGuard = new Elysia({ name: "auth" })
  .use(bearer())
  .onBeforeHandle(({ bearer, set }) => {
    if (bearer !== SECRET) {
      set.status = 401;
      return "Unauthorized";
    }
  });

new Elysia()
  .use(
    swagger({
      provider: "scalar",
      path: "/docs",
      documentation: {
        info: {
          title: "claude-remote-api",
          version: "0.1.0",
          description:
            "Personal backend proxy for TickTick task management and NTFY push notifications. All endpoints except /health and /ticktick/auth/* require Bearer token authentication.",
        },
        servers: [{ url: "https://api.jkrumm.com", description: "Production" }],
        components: {
          securitySchemes: {
            BearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      },
    }),
  )
  .use(healthRoute)
  .use(ticktickAuthRoutes)
  .use(authGuard)
  .use(notifyRoute)
  .use(ticktickRoutes)
  .listen(4000);

registerCronJobs();
console.log("claude-remote-api running on port 4000");
