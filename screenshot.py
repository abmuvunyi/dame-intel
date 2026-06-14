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
        page.screenshot(path="screenshot.png")
        browser.close()

if __name__ == "__main__":
    main()
