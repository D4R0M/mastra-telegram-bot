# Overview

This is a pure Anki-style vocabulary flashcard bot for Telegram that implements active recall and spaced repetition using the SM-2 algorithm. The bot operates with deterministic logic only - no AI/LLM APIs are used. Users can add flashcards, practice with spaced repetition using inline grading buttons, and track their progress through a simple command-based interface.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Framework
The application is built on the **Mastra framework**, which provides agent-based workflows, tool orchestration, and workflow management. Mastra serves as the central orchestration layer that connects all components including agents, tools, workflows, and external integrations.

## Practice Grading System
Implements **inline keyboard buttons** for SM-2 grading during practice sessions:
- Six grading options with descriptive emojis (0 Forgot to 5 Easy)
- Instant grade processing via callback queries
- Automatic message updates and progression to next card
- Clean UI with keyboard removal after selection

## Database Layer
Uses **PostgreSQL** as the primary database with a custom migration system. Key database components include:
- **Cards table**: Stores vocabulary cards with front/back content, tags, examples, and language metadata
- **Review states**: Tracks SM-2 algorithm parameters (ease factor, repetitions, intervals, due dates)
- **Review logs**: Historical tracking of all review sessions with performance metrics
- **User preferences**: Personalized settings for timezones, reminder schedules, and learning limits

The database layer implements the **SM-2 spaced repetition algorithm** with exact mathematical precision for optimal learning intervals based on recall performance.

## Command Parser Architecture
Features a deterministic **Command Parser** that processes all bot commands without any AI:
- **Pure Command Processing**: Parses commands like /add, /practice, /list, /stats etc. with deterministic logic
- **Multi-step Conversation Support**: Handles guided flows for card addition and review sessions
- **Direct Tool Integration**: Directly calls appropriate tools based on commands without AI decision-making
- **State Management**: Maintains conversation state for multi-step interactions using PostgreSQL storage

## Tool System
Comprehensive tool ecosystem organized by functionality:
- **Vocabulary Tools**: Card creation, editing, listing, and deletion with quick-add syntax support
- **Review Tools**: Due card retrieval, review session management, and SM-2 calculations
- **Statistics Tools**: Advanced analytics including retention rates, streak tracking, and ease histograms
- **Settings Tools**: User preference management for timezones, reminders, and learning limits
- **Import/Export Tools**: CSV-based bulk operations for vocabulary data management
- **Reminder Tools**: Intelligent scheduling respecting Do Not Disturb periods and timezone awareness

## Workflow Management
Uses **Inngest-powered workflows** for reliable task execution and event handling. The vocabulary workflow manages the complete user interaction cycle from message processing to response generation.

## Memory and Storage
Implements persistent memory using **PostgresStore** for conversation context and user state management, enabling personalized and contextual interactions across sessions.

## Development Architecture
- **TypeScript** with ES2022 modules for type safety and modern JavaScript features
- **Mastra CLI** for development workflow automation
- **Custom migration system** for database schema management
- **Modular tool organization** for maintainability and extensibility

# External Dependencies

## Core Framework Dependencies
- **@mastra/core**: Primary framework for agent orchestration and workflow management
- **@mastra/inngest**: Event-driven workflow execution and job scheduling
- **@mastra/pg**: PostgreSQL integration and storage management
- **@mastra/memory**: Persistent conversation memory and context management
- **@mastra/loggers**: Structured logging with Pino integration

## Command Processing
- **Command Parser**: Deterministic command parsing and execution without AI dependencies
- **Conversation State Storage**: PostgreSQL-based state management for multi-step interactions

## Database and Storage
- **pg**: PostgreSQL client for direct database operations
- **@types/pg**: TypeScript definitions for PostgreSQL integration

## External Service Integrations
- **@slack/web-api**: Slack workspace integration for team-based vocabulary learning
- **Telegram Bot API**: Messaging platform integration for mobile learning experiences
- **exa-js**: Web search capabilities for vocabulary context and examples

## Development and Deployment
- **inngest**: Background job processing and workflow orchestration
- **inngest-cli**: Development tooling for workflow management
- **tsx**: TypeScript execution runtime for development
- **dotenv**: Environment configuration management
- **zod**: Schema validation for API inputs and data structures
- **pino**: High-performance JSON logging
- **prettier**: Code formatting and style consistency