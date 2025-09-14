import { mastra } from "../src/mastra/index.js";
import { processTelegramUpdate } from "../src/mastra/telegram.js";

async function main() {
  process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
  const sent: any[] = [];
  const originalFetch = global.fetch;
  // Mock Telegram API call
  global.fetch = async (url: any, options: any) => {
    if (typeof url === "string" && url.includes("sendMessage")) {
      const body = JSON.parse(options.body as string);
      sent.push(body);
      return { json: async () => ({ result: { message_id: 1 } }) } as any;
    }
    return { json: async () => ({}) } as any;
  };

  await processTelegramUpdate(
    {
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 123 },
        from: { id: 6776842238 },
        text: "/start",
      },
    },
    mastra,
    Date.now(),
  );

  global.fetch = originalFetch;
  const text = sent[0]?.text || "";
  if (text.trim() === "/start") {
    throw new Error("Echoed /start instead of welcome message");
  }
  console.log("Sample update processed. Bot replied:", text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
