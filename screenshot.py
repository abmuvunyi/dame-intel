import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    for _ in range(10):
        try:
            page.goto("http://127.0.0.1:3000")
            break
        except Exception:
            time.sleep(1)
    time.sleep(5) # wait for page to load
    page.screenshot(path="screenshot.png")
    browser.close()
