import urllib.request

url = "https://en.wikipedia.org/wiki/International_draughts"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    if "promotion" in html.lower():
        print("Found promotion rules in International draughts")
except Exception as e:
    print(e)
