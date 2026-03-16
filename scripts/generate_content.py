#!/usr/bin/env python3
"""Read an Anki collection.anki2 SQLite database and generate Hugo content files."""

import html
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

FIELD_SEP = "\x1f"
DB_PATH = Path("data/collection.anki2")
CONTENT_DIR = Path("content")


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower().strip()
    # Transliterate common characters but keep CJK as-is
    text = re.sub(r"[''']", "", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return text.strip()


def strip_sound(text: str) -> str:
    """Remove [sound:...] references."""
    return re.sub(r"\[sound:[^\]]+\]", "", text)


def escape_yaml(text: str) -> str:
    """Escape a string for use in YAML front matter."""
    if not text:
        return '""'
    # If it contains special chars, quote it
    if any(c in text for c in ':{}[]&*?|>!%#`@,"\'\n'):
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def load_db(db_path: Path):
    """Load all needed data from the Anki database."""
    conn = sqlite3.connect(str(db_path))

    # Decks: id -> name
    decks = {}
    for row in conn.execute("SELECT id, name FROM decks"):
        decks[row[0]] = row[1]

    # Notetypes: id -> name
    notetypes = {}
    for row in conn.execute("SELECT id, name FROM notetypes"):
        notetypes[row[0]] = row[1]

    # Fields: ntid -> [(ord, name), ...]
    fields = {}
    for row in conn.execute("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"):
        fields.setdefault(row[0], []).append(row[2])

    # Notes: id -> {mid, tags, flds}
    notes = {}
    for row in conn.execute("SELECT id, mid, tags, flds FROM notes"):
        notes[row[0]] = {
            "mid": row[1],
            "tags": [t for t in row[2].strip().split() if t],
            "flds": row[3].split(FIELD_SEP),
        }

    # Cards: join card to note and deck, including progress fields
    cards = []
    for row in conn.execute(
        "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards"
    ):
        card_type = {0: "new", 1: "learning", 2: "review", 3: "relearning"}.get(row[4], "new")
        cards.append({
            "id": row[0],
            "nid": row[1],
            "did": row[2],
            "ord": row[3],
            "state": card_type,
            "interval": row[7],  # days until next review
            "ease": row[8],      # ease factor (2500 = 250%)
            "reps": row[9],
            "lapses": row[10],
        })

    # Review history: card_id -> list of reviews (newest first)
    reviews: dict[int, list] = {}
    for row in conn.execute(
        "SELECT id, cid, ease, ivl, lastIvl, time, type FROM revlog ORDER BY id"
    ):
        ts = datetime.fromtimestamp(row[0] / 1000)
        ease_label = {1: "again", 2: "hard", 3: "good", 4: "easy"}.get(row[2], str(row[2]))
        reviews.setdefault(row[1], []).append({
            "date": ts.strftime("%Y-%m-%d"),
            "ease": ease_label,
            "interval": row[3],
            "time_secs": round(row[5] / 1000, 1),
        })

    # Compute again-rate per card
    again_rates: dict[int, float] = {}
    for card_id, revs in reviews.items():
        if len(revs) >= 3:
            agains = sum(1 for r in revs if r["ease"] == "again")
            again_rates[card_id] = agains / len(revs)

    conn.close()
    return decks, notetypes, fields, notes, cards, reviews, again_rates


def deck_path_parts(deck_name: str) -> list[str]:
    """Split a deck name (possibly hierarchical) into path parts."""
    parts = deck_name.split(FIELD_SEP)
    return [slugify(p) for p in parts if p.strip()]


def build_card_content(note: dict, field_names: list[str], notetype_name: str) -> dict:
    """Build front matter and body content for a card page."""
    flds = note["flds"]
    field_map = {}
    for i, name in enumerate(field_names):
        if i < len(flds):
            field_map[name] = flds[i]

    result = {"title": "", "summary": "", "body": "", "tags": note["tags"], "params": {}}

    if notetype_name == "Kaishi 1.5k":
        word = strip_html(strip_sound(field_map.get("Word", "")))
        reading = strip_html(field_map.get("Word Reading", ""))
        meaning = strip_html(field_map.get("Word Meaning", ""))
        sentence = field_map.get("Sentence", "")
        sentence_meaning = strip_html(field_map.get("Sentence Meaning", ""))
        notes_text = strip_html(field_map.get("Notes", ""))

        result["title"] = f"{word}" if word else "Untitled"
        result["summary"] = f"{reading} — {meaning}" if reading and meaning else meaning
        result["params"] = {
            "reading": reading,
            "meaning": meaning,
            "frequency": strip_html(field_map.get("Frequency", "")),
        }

        body_parts = []
        if reading or meaning:
            body_parts.append(f"**{reading}** — {meaning}")
        if sentence:
            body_parts.append(f"\n### Example\n\n{sentence}")
            if sentence_meaning:
                body_parts.append(f"\n{sentence_meaning}")
        if notes_text:
            body_parts.append(f"\n### Notes\n\n{notes_text}")
        result["body"] = "\n".join(body_parts)

    elif notetype_name == "MIA Kanji":
        char = strip_html(strip_sound(field_map.get("Character", "")))
        keyword = strip_html(field_map.get("Keyword", ""))
        meanings = strip_html(field_map.get("Meanings", ""))
        story = strip_html(field_map.get("Story", ""))
        primitive = strip_html(field_map.get("Primitive", ""))

        result["title"] = char if char else keyword or "Untitled"
        result["summary"] = keyword or meanings
        result["params"] = {
            "keyword": keyword,
            "meanings": meanings,
        }

        body_parts = []
        if keyword:
            body_parts.append(f"**Keyword:** {keyword}")
        if meanings:
            body_parts.append(f"\n**Meanings:** {meanings}")
        if story:
            body_parts.append(f"\n### Story\n\n{story}")
        if primitive:
            body_parts.append(f"\n### Primitive\n\n{primitive}")
        result["body"] = "\n".join(body_parts)

    else:
        # Generic: use first field as title, rest as body
        first = strip_html(strip_sound(flds[0])) if flds else "Untitled"
        result["title"] = first[:100] if first else "Untitled"
        result["summary"] = strip_html(strip_sound(flds[1]))[:200] if len(flds) > 1 else ""

        body_parts = []
        for i, name in enumerate(field_names):
            if i < len(flds) and flds[i].strip():
                val = flds[i]
                body_parts.append(f"### {name}\n\n{val}")
        result["body"] = "\n\n".join(body_parts)

    return result


def format_interval(days: int) -> str:
    """Format an interval in days to a human-readable string."""
    if days < 0:
        # Negative intervals are in seconds in Anki (learning steps)
        return f"{abs(days)}s"
    if days == 0:
        return "0d"
    if days < 30:
        return f"{days}d"
    if days < 365:
        months = days / 30.44
        return f"{months:.1f}mo"
    years = days / 365.25
    return f"{years:.1f}y"


def write_page(path: Path, title: str, summary: str, body: str, tags: list[str],
               params: dict, progress: dict | None = None,
               review_history: list | None = None):
    """Write a Hugo content page."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["---"]
    lines.append(f"title: {escape_yaml(title)}")
    if summary:
        lines.append(f"summary: {escape_yaml(summary)}")
    if tags:
        lines.append("tags:")
        for t in tags:
            lines.append(f"  - {escape_yaml(t)}")
    if params or progress:
        lines.append("params:")
        for k, v in (params or {}).items():
            if v:
                lines.append(f"  {k}: {escape_yaml(v)}")
        if progress:
            lines.append(f"  state: {progress['state']}")
            lines.append(f"  interval: {progress['interval']}")
            lines.append(f"  ease: {progress['ease']}")
            lines.append(f"  reps: {progress['reps']}")
            lines.append(f"  lapses: {progress['lapses']}")
            if progress.get("difficult"):
                lines.append("  difficult: true")
    lines.append("---")
    lines.append("")
    lines.append(body)

    # Append progress section
    if progress:
        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("### Progress")
        lines.append("")
        state = progress["state"]
        reps = progress["reps"]
        lapses = progress["lapses"]
        interval = format_interval(progress["interval"])
        ease_pct = progress["ease"] / 10 if progress["ease"] > 0 else 0

        lines.append(f"- **Status:** {state}")
        if state != "new":
            lines.append(f"- **Reviews:** {reps}")
            lines.append(f"- **Lapses:** {lapses}")
            lines.append(f"- **Interval:** {interval}")
            if ease_pct:
                lines.append(f"- **Ease:** {ease_pct:.0f}%")

        if review_history:
            lines.append("")
            lines.append("#### Review History")
            lines.append("")
            lines.append("| Date | Rating | Interval | Time |")
            lines.append("|------|--------|----------|------|")
            for rev in review_history:
                ivl = format_interval(rev["interval"])
                lines.append(
                    f"| {rev['date']} | {rev['ease']} | {ivl} | {rev['time_secs']}s |"
                )

    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    if not DB_PATH.exists():
        print(f"Error: {DB_PATH} not found. Run 'make sync-db' first.", file=sys.stderr)
        sys.exit(1)

    decks, notetypes, fields, notes, cards, reviews, again_rates = load_db(DB_PATH)

    # Clear existing generated content (keep _index.md and random.md)
    keep_files = {"_index.md", "random.md"}
    for item in CONTENT_DIR.iterdir():
        if item.name in keep_files:
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()

    # Group cards by deck
    cards_by_deck: dict[int, list] = {}
    for card in cards:
        cards_by_deck.setdefault(card["did"], []).append(card)

    # Skip the Default deck if it has no cards
    skip_decks = set()
    for did, name in decks.items():
        if name == "Default" and did not in cards_by_deck:
            skip_decks.add(did)

    # Create deck sections and card pages
    seen_notes = set()  # avoid duplicate pages for multi-card notes
    total_pages = 0

    for did, deck_name in sorted(decks.items(), key=lambda x: x[1]):
        if did in skip_decks:
            continue
        if did not in cards_by_deck:
            continue

        parts = deck_path_parts(deck_name)
        if not parts:
            continue

        deck_dir = CONTENT_DIR / Path(*parts)

        # Create _index.md for deck (and any parent decks)
        cumulative = CONTENT_DIR
        name_parts = deck_name.split(FIELD_SEP)
        for i, part in enumerate(parts):
            cumulative = cumulative / part
            cumulative.mkdir(parents=True, exist_ok=True)
            index_path = cumulative / "_index.md"
            if not index_path.exists():
                display_name = name_parts[i] if i < len(name_parts) else part
                index_path.write_text(
                    f"---\ntitle: {escape_yaml(display_name)}\n---\n",
                    encoding="utf-8",
                )

        # Generate card pages
        for card in cards_by_deck[did]:
            nid = card["nid"]
            if nid in seen_notes:
                continue
            seen_notes.add(nid)

            # Skip cards never reviewed
            if card["reps"] == 0:
                continue

            note = notes.get(nid)
            if not note:
                continue

            mid = note["mid"]
            notetype_name = notetypes.get(mid, "Unknown")
            field_names = fields.get(mid, [])

            content = build_card_content(note, field_names, notetype_name)

            # Flag difficult cards: lapsed, low ease, or high again-rate
            difficult = (
                card["lapses"] >= 1
                or card["ease"] < 2500
                or again_rates.get(card["id"], 0) > 0.5
            )

            progress = {
                "state": card["state"],
                "interval": card["interval"],
                "ease": card["ease"],
                "reps": card["reps"],
                "lapses": card["lapses"],
                "difficult": difficult,
            }
            card_reviews = reviews.get(card["id"], [])

            # Use note ID as filename for uniqueness
            page_path = deck_dir / f"{nid}.md"
            write_page(
                page_path,
                title=content["title"],
                summary=content["summary"],
                body=content["body"],
                tags=content["tags"],
                params=content["params"],
                progress=progress,
                review_history=card_reviews,
            )
            total_pages += 1

    print(f"Generated {total_pages} card pages across {len(cards_by_deck)} decks.")


if __name__ == "__main__":
    main()
