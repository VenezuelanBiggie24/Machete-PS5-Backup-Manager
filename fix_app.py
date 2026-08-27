import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

# 1. Remove the old transferProgress state
state_regex = re.compile(r'\s*const \[transferProgress, setTransferProgress\] = useState<\{[\s\S]*?\} \| null>\(null\);')
app_tsx = state_regex.sub('', app_tsx)

# 2. Insert TransferProgressModal in the return block
app_tsx = app_tsx.replace('{/* Background decoration */}', '<TransferProgressModal />\n      {/* Background decoration */}')

# 3. Remove the old Modal if it still exists
old_modal_regex = re.compile(r'\{\/\* Transfer Progress Modal \*\/\}.*?(?=\s*\{\/\* Toast Notification)', re.DOTALL)
app_tsx = old_modal_regex.sub('', app_tsx)

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)
