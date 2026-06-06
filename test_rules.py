import re

with open('backend/src/game/engine/engine.service.ts', 'r') as f:
    content = f.read()

print("Board Size mentioned:", "boardSize" in content)
