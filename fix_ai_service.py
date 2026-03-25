import re

filepath = "backend/src/game/ai/ai/ai.service.ts"
with open(filepath, "r") as f:
    content = f.read()

# Update simEngine initialization to use the correct variant
sim_logic = """    const aiColor = engine.getCurrentTurn();
    const isMaximizingPlayer = true;

    // Deep clone the board
    const cloneBoard = JSON.parse(JSON.stringify(engine.getBoard()));
    const simEngine = new DraughtsEngine(engine.variant);
    simEngine.loadBoard(cloneBoard, aiColor);"""
content = re.sub(r"    const aiColor = engine\.getCurrentTurn\(\);\n    const isMaximizingPlayer = true;\n\n    // Deep clone the board\n    const cloneBoard = JSON\.parse\(JSON\.stringify\(engine\.getBoard\(\)\)\);\n    const simEngine = new DraughtsEngine\(\);\n    simEngine\.loadBoard\(cloneBoard, aiColor\);", sim_logic, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated AI Service")
