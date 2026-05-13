import time
from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        for i in range(10):
            try:
                page.goto("http://localhost:3000", wait_until="networkidle")
                break
            except Exception as e:
                print(f"Server not ready, retrying... {e}")
                time.sleep(2)

        page.screenshot(path="screenshot.png")
        print("Screenshot saved to frontend/screenshot.png")
        browser.close()

if __name__ == "__main__":
    verify()
