.PHONY: serve build clean draft sync-db generate sync

serve:
	hugo server

draft:
	hugo server --buildDrafts

build:
	hugo --minify

clean:
	rm -rf public/

sync-db:
	mkdir -p data
	cp "/Users/brent/Library/Application Support/Anki2/User 1/collection.anki2" data/collection.anki2

generate:
	python3 scripts/generate_content.py

sync:
	./scripts/sync.sh
