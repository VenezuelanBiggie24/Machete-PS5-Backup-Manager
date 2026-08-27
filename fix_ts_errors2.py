import re

with open("src/App.tsx", "r") as f:
    app = f.read()

# Remove formatBytes function entirely from App.tsx since it's now in GameCard
app = re.sub(r'function formatBytes[\s\S]*?return[^}]*\}', '', app)

with open("src/App.tsx", "w") as f:
    f.write(app)
