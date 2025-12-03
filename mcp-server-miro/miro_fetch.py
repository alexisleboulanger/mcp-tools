## Usage with environment variables:
# export MIRO_TOKEN=your-token
# export MIRO_BOARD_ID=uXjVLg4ALQs=
# export MIRO_FRAME_ID=3458764616830951294
# python .knowledge/delivery/discovery/miro_fetch.py

# Usage with command-line arguments:
# export MIRO_TOKEN=your-token
# python .knowledge/delivery/discovery/miro_fetch.py uXjVLg4ALQs= 3458764616830951294


import os
import sys
import requests
from html import unescape

MIRO_TOKEN = os.environ.get("MIRO_TOKEN")
BOARD_ID = os.environ.get("MIRO_BOARD_ID")
FRAME_ID = os.environ.get("MIRO_FRAME_ID")

HEADERS = {
    "Authorization": f"Bearer {MIRO_TOKEN}",
    "Accept": "application/json",
}

def plain(text_html: str) -> str:
    if not text_html:
        return ""
    # Very light cleaning: unescape HTML entities and strip paragraph tags.
    txt = unescape(text_html)
    txt = txt.replace("<p>", "").replace("</p>", "\n")
    return txt.strip()

def fetch_items_in_frame(frame_id: str):
    items = []
    params = {
        "parent_item_id": frame_id,
        "limit": 50,
    }
    base_url = f"https://api.miro.com/v2/boards/{BOARD_ID}/items"
    url = base_url

    while url:
        resp = requests.get(url, headers=HEADERS, params=params)
        resp.raise_for_status()
        data = resp.json()

        items.extend(data.get("data", []))

        # After first call, pagination is via next link; params are encoded there.
        links = data.get("links", {})
        url = links.get("next")
        params = {}  # next already encodes cursor etc.

    return items

def main():
    if not MIRO_TOKEN:
        raise SystemExit("Please set MIRO_TOKEN environment variable with your Miro access token.")

    # Allow BOARD_ID and FRAME_ID via env vars or CLI args.
    # Priority: env vars > CLI args. Both are required.
    global BOARD_ID, FRAME_ID

    # CLI: python miro_fetch.py <board_id> <frame_id>
    if not BOARD_ID and len(sys.argv) > 1:
        BOARD_ID = sys.argv[1]
    if not FRAME_ID and len(sys.argv) > 2:
        FRAME_ID = sys.argv[2]

    if not BOARD_ID or not FRAME_ID:
        raise SystemExit(
            "Usage: set MIRO_BOARD_ID and MIRO_FRAME_ID env vars, or "
            "run as: python miro_fetch.py <board_id> <frame_id>"
        )

    # 1) Items directly in the given frame
    items = fetch_items_in_frame(FRAME_ID)
    print(f"Board {BOARD_ID}")
    print(f"Found {len(items)} items in frame {FRAME_ID}\n")

    # 2) List direct items and collect nested frames
    child_frames = []
    for it in items:
        it_type = it.get("type")
        it_id = it.get("id")
        data = it.get("data", {}) or {}
        title = data.get("title")
        content = data.get("content")

        print("=" * 80)
        print(f"ID:    {it_id}")
        print(f"Type:  {it_type}")

        if title:
            print("Title:")
            print(plain(title))

        if content:
            print("Content:")
            print(plain(content)[:2000])

        if it_type == "image":
            print("Image URL:", data.get("imageUrl"))
        elif it_type == "stamp":
            print("(stamp – no textual content)")

        print()

        if it_type == "frame":
            child_frames.append((it_id, plain(title) if title else ""))

    # 3) For each child frame, fetch its contents too
    for child_id, child_title in child_frames:
        print("#" * 80)
        print(f"Nested frame {child_id} – {child_title or '(no title)'}")
        nested_items = fetch_items_in_frame(child_id)
        print(f"Found {len(nested_items)} items inside nested frame {child_id}\n")

        for it in nested_items:
            it_type = it.get("type")
            it_id = it.get("id")
            data = it.get("data", {}) or {}
            title = data.get("title")
            content = data.get("content")

            print("=" * 80)
            print(f"[Nested] ID:    {it_id}")
            print(f"[Nested] Type:  {it_type}")

            if title:
                print("Title:")
                print(plain(title))

            if content:
                print("Content:")
                print(plain(content)[:2000])

            if it_type == "image":
                print("Image URL:", data.get("imageUrl"))
            elif it_type == "stamp":
                print("(stamp – no textual content)")

            print()

if __name__ == "__main__":
    main()