import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

app_tsx = re.sub(r'\s*\{\/\* Transfer Progress Cyberpunk UI \*\/\}[\s\S]*?(?=\s*\{\/\* Drop Zone \*\/})', '', app_tsx)

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)
