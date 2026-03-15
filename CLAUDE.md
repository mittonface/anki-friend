# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Anki Friend is a Hugo site that reads an Anki SQLite database and generates a browsable website from it. Anki decks become Hugo sections, cards become pages.

## Commands

- `make serve` — local dev server (localhost:1313)
- `make draft` — dev server including draft content
- `make build` — production build (outputs to `public/`)
- `make clean` — remove `public/`
- `make sync-db` — copy local Anki DB (`collection.anki2`) into `data/`

Hugo is installed via Homebrew (v0.154.5, extended).

## Architecture

- **Hugo config**: `hugo.toml` — uses `anki-theme`
- **Theme**: `themes/anki-theme/` — all layouts, CSS (`assets/css/main.css`), JS (`assets/js/main.js`)
- **Layouts**:
  - `home.html` — lists all top-level sections as "Decks" with card counts
  - `section.html` — lists cards in a deck with summaries
  - `page.html` — single card view with tag terms
  - `baseof.html` — base template (head, header, main block, footer)
- **Content**: `content/` — generated from Anki DB (not hand-authored); `_index.md` is the homepage
- **Data pipeline**: `make sync-db` copies the Anki SQLite DB; a script (not yet built) will parse it and generate Hugo content files under `content/`
