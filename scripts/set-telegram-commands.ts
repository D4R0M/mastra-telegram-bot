import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

const adminIds = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const userCommands = [
  { command: "add", description: "Add a card" },
  { command: "practice", description: "Start a review session" },
  { command: "due", description: "Show due cards" },
  { command: "list", description: "Show your cards" },
  { command: "stats", description: "View statistics" },
  { command: "streak", description: "Check streak" },
  { command: "help", description: "Show help" },
];

const adminCommands = [
  { command: "users", description: "List whitelisted users" },
  { command: "allow", description: "Allow a user" },
  { command: "deny", description: "Deny a user" },
  { command: "invite", description: "Create invite link" },
  { command: "export_users", description: "Export whitelist CSV" },
  { command: "promote", description: "Promote user to admin" },
  { command: "demote", description: "Demote admin to user" },
  { command: "check_ml_log", description: "Review ML logging status" },
  { command: "adminhelp", description: "Show admin commands" },
];

async function setCommands(commands: any[], scope: any) {
  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands, scope }),
  });
}

await setCommands(userCommands, { type: "all_private_chats" });
for (const id of adminIds) {
  await setCommands([...userCommands, ...adminCommands], {
    type: "chat",
    chat_id: id,
  });
}

console.log("Commands set");
