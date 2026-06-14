import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for i in range(10):
            try:
                page.goto("http://localhost:3000")
                break
            except Exception as e:
                print(f"Waiting for frontend... {e}")
                time.sleep(2)

        # Click Play Computer AI Lvl 1
        page.click("button:has-text('AI Lvl 1')")
        time.sleep(2) # wait for board to render
        page.screenshot(path="screenshot_game.png")
        browser.close()

if __name__ == "__main__":
    main()
