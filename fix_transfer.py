with open("src-tauri/src/transfer.rs", "r") as f:
    text = f.read()

text = "use tauri::Emitter;\n" + text

with open("src-tauri/src/transfer.rs", "w") as f:
    f.write(text)

