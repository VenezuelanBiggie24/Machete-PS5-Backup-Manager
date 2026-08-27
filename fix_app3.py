with open("src/App.tsx", "r") as f:
    app = f.read()

app = app.replace("      </div>}\n          </AnimatePresence>\n        </div>\n        </div>\n      )}", "      </div>")

with open("src/App.tsx", "w") as f:
    f.write(app)
