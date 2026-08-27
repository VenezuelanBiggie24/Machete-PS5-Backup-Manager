import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

# I will find the block starting with `{/* Transfer Progress Modal */}` and remove it entirely.
# The block probably starts with:
# {transferProgress && (
#   <div className="fixed inset-0 z-[100] ...

app_tsx = re.sub(r'\{/\* Transfer Progress Modal \*/\}[\s\S]*?\{transferProgress && \([\s\S]*?\}\)[\s\S]*?\}\)', '', app_tsx)

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)
