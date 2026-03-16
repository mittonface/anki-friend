# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Anki Friend is a Hugo site that reads an Anki SQLite database and generates a browsable website from it. Anki decks become Hugo sections, cards become pages. Hosted at **anki.mittn.ca** via GitHub Pages.

## Commands

- `make serve` — local dev server (localhost:1313)
- `make draft` — dev server including draft content
- `make build` — production build (outputs to `public/`)
- `make clean` — remove `public/`
- `make sync-db` — copy local Anki DB (`collection.anki2`) into `data/`
- `make generate` — run `python3 scripts/generate_content.py` to rebuild `content/` from the Anki DB

Hugo is installed via Homebrew (v0.154.5, extended).

## Architecture

- **Hugo config**: `hugo.toml` — uses `anki-theme`, unsafe HTML rendering enabled
- **Theme**: `themes/anki-theme/` — all layouts, CSS (`assets/css/main.css`), JS (`assets/js/main.js`)
- **Layouts** (in `themes/anki-theme/layouts/`):
  - `baseof.html` — base template (head, header, main block, footer)
  - `home.html` — lists all top-level sections as "Decks" with card counts
  - `section.html` — lists cards in a deck with summaries
  - `page.html` — single card view with tag terms
  - `taxonomy.html` / `term.html` — taxonomy views (e.g. tags)
  - `_partials/` — header, footer, menu, terms, head (with css/js sub-partials)
- **Content**: `content/` — generated from Anki DB via `make generate` (not hand-authored); `_index.md` is the homepage
- **Data pipeline**: `scripts/generate_content.py` — Python script that reads `data/collection.anki2` (SQLite), parses Anki notes/cards, and writes Hugo content files under `content/`. Uses `\x1f` field separator, strips HTML, slugifies deck/card names.

## Deployment

- GitHub Actions workflow (`.github/workflows/`) auto-deploys to GitHub Pages on push to `main`
- Custom domain: `anki.mittn.ca` (via `CNAME` file)
