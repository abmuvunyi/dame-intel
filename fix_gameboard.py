import re

filepath = "frontend/src/components/game/GameBoard.tsx"
with open(filepath, "r") as f:
    content = f.read()

# Remove duplicate handlers block since the regex replacement wasn't perfect
duplicate_handlers = """  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking', { tournamentId: tournamentIdToJoin });
    }
  };

  const handlePlayAI = (difficulty: number) => {
    if (socket) {
      socket.emit('playVsAi', { difficulty });
    }
  };"""

content = content.replace(duplicate_handlers, "")

with open(filepath, "w") as f:
    f.write(content)

print("Fixed duplicate handlers in GameBoard.tsx")
