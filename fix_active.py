with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

app_tsx = app_tsx.replace(
    "const [isLoading, setIsLoading] = useState(false);", 
    "const [isLoading, setIsLoading] = useState(false);\n  const [transferActive, setTransferActive] = useState(false);"
)

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)
