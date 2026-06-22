import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Retry loop in case server takes time
    for _ in range(5):
        try:
            page.goto('http://localhost:3000')
            break
        except Exception:
            time.sleep(1)

    time.sleep(2) # Give React time to render

    # Select 10x10 International variant
    page.select_option("select", "10")
    time.sleep(1)

    page.screenshot(path="screenshot.png")
    print("Screenshot saved to screenshot.png")

    browser.close()
