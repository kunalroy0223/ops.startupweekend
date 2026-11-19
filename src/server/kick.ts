import "server-only";
import { after } from "next/server";
import { processOutbox } from "./notifications/processor";

/** Process the outbox after the response is sent. The cron route is the durable backstop. */
export function kickOutbox() {
  after(async () => {
    try {
      await processOutbox(10);
    } catch (err) {
      console.error("[outbox] post-response processing failed; cron will retry", err);
    }
  });
}
