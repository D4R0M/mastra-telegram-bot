# Telegram Vocabulary Bot - Mastra Edition

A sophisticated vocabulary learning bot for Telegram that implements spaced repetition using the SM-2 algorithm. Built with the [Mastra framework](https://mastra.ai/en/docs) for workflow orchestration and advanced agent capabilities.

## Features

- **Spaced Repetition Learning**: Uses the scientifically-proven SM-2 algorithm for optimal memory retention
- **Interactive Practice Sessions**: Grade vocabulary cards with inline keyboard buttons (0-5 difficulty scale)
- **Advanced Statistics**: Track learning progress, retention rates, and streak counters
- **Multi-language Support**: Add vocabulary cards with front/back in different languages
- **Import/Export**: Bulk operations with CSV file support
- **Smart Reminders**: Timezone-aware notifications with Do Not Disturb periods
- **Comprehensive Analytics**: Ease factor histograms, comprehensive learning statistics

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Telegram Bot Token (from @BotFather)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository>
   cd <project-directory>
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your values:
   ```bash
   NODE_ENV=development
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   DATABASE_URL=postgresql://user:password@localhost:5432/vocab_bot
   USE_POLLING=true
   ```

3. **Database setup:**
   - Ensure PostgreSQL is running
   - Database migrations run automatically on app startup

4. **Start development server:**
   ```bash
   npm run dev
   ```

The bot will use **polling mode** in development (no webhook required).

## Railway Deployment (Production)

### Deploy Steps

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Deploy to Railway"
   git push origin main
   ```

2. **Deploy on Railway:**
   - Go to [Railway](https://railway.app)
   - Create new project → Deploy from GitHub
   - Select your repository
   - Choose **Web Service** (not Worker)

3. **Set Environment Variables:**
   ```bash
   NODE_ENV=production
   TELEGRAM_BOT_TOKEN=your_bot_token
   DATABASE_URL=your_postgresql_url
   PUBLIC_URL=https://your-app.railway.app
   ```

4. **Configure Start Command:**
   - Railway should auto-detect: `npm start`
   - Or manually set: `npm run build && npm start`

5. **Set Webhook:**
   After deployment, run locally to set the webhook:
   ```bash
   PUBLIC_URL=https://your-app.railway.app TELEGRAM_BOT_TOKEN=your_token node scripts/set-telegram-webhook.js
   ```

### Production Features

- **Webhook Mode**: Efficient message handling via Telegram webhooks
- **Health Check**: `GET /health` endpoint for monitoring
- **Database Migrations**: Auto-run on startup with proper error handling
- **Fail-Fast Validation**: Application exits early if required environment variables (DATABASE_URL, TELEGRAM_BOT_TOKEN for webhooks) are missing in production
- **Production Logging**: Structured JSON logging with Pino

### Environment Variables

**Required in Production:**
- `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather
- `DATABASE_URL`: PostgreSQL connection string
- `PUBLIC_URL`: Your Railway app URL (for webhook setup)
- `NODE_ENV=production`

**Optional:**
- `PORT`: Server port (Railway sets this automatically)
- `INNGEST_CONFIG`: Custom Inngest configuration path

### API Endpoints

- `GET /health` - Health check (returns `{"status":"ok"}`)
- `POST /webhooks/telegram/action` - Telegram webhook endpoint
- `POST /api/inngest` - Inngest workflow registration

### Commands

**Bot Commands:**
- `/add` - Add new vocabulary card (guided mode)
- `/add word | translation` - Quick add card
- `/list` - Show your vocabulary cards
- `/practice` - Start spaced repetition session  
- `/stats` - View learning statistics
- `/settings` - Manage bot preferences
- `/import` - Import cards from CSV
- `/export` - Export cards to CSV

**Development Scripts:**
- `npm run dev` - Start development server (polling mode)
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - TypeScript type checking
- `npm run format` - Format code with Prettier

## Architecture

Built on the **[Mastra framework](https://mastra.ai/en/docs)** with:

- **Agent-based Workflows**: Orchestrated task execution with Inngest
- **PostgreSQL Storage**: Persistent data with automatic migrations
- **Tool System**: Modular functionality (vocabulary, reviews, statistics, etc.)
- **Memory Management**: Conversation state tracking for multi-step interactions
- **Error Handling**: Comprehensive logging and graceful error recovery

## Database Schema

- **Cards**: Vocabulary entries with tags, examples, and metadata
- **Review States**: SM-2 algorithm parameters (ease factor, intervals, due dates)
- **Review Logs**: Historical performance tracking
- **User Preferences**: Personalized settings and timezone configurations
- **Migrations**: Automatic schema versioning

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Create Pull Request

## License

[Add your license here]