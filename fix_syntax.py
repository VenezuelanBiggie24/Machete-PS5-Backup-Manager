with open("src/App.tsx", "r") as f:
    code = f.read()

code = code.replace("export default \nconst TransferProgressModal", "const TransferProgressModal")
code = code.replace("\nfunction App() {", "\nexport default function App() {")

with open("src/App.tsx", "w") as f:
    f.write(code)

print("Syntax fixed")
