with open("src/App.tsx", "r") as f:
    content = f.read()

content = content.replace("Loader2, ", "")

with open("src/App.tsx", "w") as f:
    f.write(content)
