export interface ConversationState {
  mode?:
    | "add_card_guided"
    | "edit_card"
    | "review_session"
    | "import_csv"
    | "settings_menu"
    | "filter_cards"
    | "export_csv";
  step?: number;
  data?: any;
  lastMessageTime?: number;
}

export interface CommandResponse {
  response: string;
  conversationState?: ConversationState;
  inline_keyboard?: any;
  reply_keyboard?: any;
  parse_mode?: "HTML" | "Markdown";
  edit_message_id?: string;
  remove_keyboard?: boolean;
  document?: { filename: string; content: string };
}
