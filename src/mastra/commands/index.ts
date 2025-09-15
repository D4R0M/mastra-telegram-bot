import type { ConversationState, CommandResponse } from "../commandTypes.js";

export type CommandHandler = (
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
) => Promise<CommandResponse>;

import add from "./add.js";
import list from "./list.js";
import practice from "./practice.js";
import stats from "./stats.js";
import edit from "./edit.js";
import del from "./delete.js";
import settings from "./settings.js";
import exportCmd from "./export.js";
import importCmd from "./import.js";
import streak from "./streak.js";
import due from "./due.js";
import help from "./help.js";
import reset from "./reset.js";
import reminders from "./reminders.js";
import testCmd from "./test.js";
import start from "./start.js";
import debugReminders from "./debugReminders.js";
import allow from "./allow.js";
import deny from "./deny.js";
import whitelistList from "./whitelistList.js";
import whitelistExport from "./whitelistExport.js";
import invite from "./invite.js";

export const commandRegistry: Record<string, CommandHandler> = {
  "/add": add,
  "/a": add,
  "/l": list,
  "/cards": list,
  "/export_cards": exportCmd,
  "/practice": practice,
  "/p": practice,
  "/review": practice,
  "/study": practice,
  "/stats": stats,
  "/statistics": stats,
  "/edit": edit,
  "/e": edit,
  "/update": edit,
  "/delete": del,
  "/d": del,
  "/remove": del,
  "/settings": settings,
  "/config": settings,
  "/preferences": settings,
  "/import": importCmd,
  "/due": due,
  "/pending": due,
  "/streak": streak,
  "/progress": streak,
  "/help": help,
  "/h": help,
  "/start": start,
  "/commands": help,
  "/reset": reset,
  "/remind": reminders,
  "/reminders": reminders,
  "/test": testCmd,
  "/debug_reminders": debugReminders,
  "/allow": allow,
  "/deny": deny,
  "/list": whitelistList,
  "/export": whitelistExport,
  "/invite": invite,
};
