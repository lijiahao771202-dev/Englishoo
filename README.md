# Englishoo

A modern vocabulary learning app based on the FSRS (Free Spaced Repetition Scheduler) algorithm, featuring a premium Liquid Glass UI and DeepSeek AI integration for enriching word data.

## Features

- **FSRS Algorithm**: Optimizes review schedules to minimize forgetting and maximize retention.
- **Liquid Glass UI**: A premium, modern interface with glassmorphism effects and smooth animations.
- **DeepSeek AI**: Automatically generates example sentences, mnemonics, and associations for new words.
- **Local Storage**: All data is stored locally in your browser using IndexedDB (via `idb`).
- **Responsive Design**: Works seamlessly on mobile and desktop.

## Tech Stack

- **Framework**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + Framer Motion
- **Algorithm**: `ts-fsrs`
- **Database**: `idb` (IndexedDB wrapper)
- **AI**: DeepSeek API (`axios`)

## Getting Started

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Start Development Server**

   ```bash
   npm run dev
   ```

3. **Configure DeepSeek API**

   - Get an API key from [DeepSeek Platform](https://platform.deepseek.com/).
   - Open the app and click the **Settings** (Gear icon) in the top right corner.
   - Paste your API Key and click **Save Settings**.

## Usage

1. **Add Words**: Click "Add New Word" to manually input a word and its meaning.
2. **Enrich Data**: During review or card detail view, click the "Sparkles" icon to let AI generate examples and mnemonics.
3. **Review**: Click "Start Review" to go through your due cards. Rate them as "Again", "Hard", "Good", or "Easy" based on your recall.

## License

MIT
