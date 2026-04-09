from playwright.sync_api import sync_playwright
import time

def take_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Give server time to start
        time.sleep(5)

        page.goto('http://localhost:3000')
        page.wait_for_selector('select')

        # Click the select element
        page.click('select')
        time.sleep(1) # wait for dropdown

        page.screenshot(path='frontend_ui.png', full_page=True)

        browser.close()

if __name__ == '__main__':
    take_screenshot()
