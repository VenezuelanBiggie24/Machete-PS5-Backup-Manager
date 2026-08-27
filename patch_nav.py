import re

nav_en = """<div align="right">
  <strong>🇺🇸 English</strong> | <a href="README_es.md">🇪🇸 Español</a> | <a href="README_ve.md">🇻🇪 Español (Venezuela)</a>
</div>\n\n"""

with open("README.md", "r") as f:
    en_content = f.read()
if "<div align=\"right\">" not in en_content:
    with open("README.md", "w") as f:
        f.write(nav_en + en_content)


nav_es = """<div align="right">
  <a href="README.md">🇺🇸 English</a> | <strong>🇪🇸 Español</strong> | <a href="README_ve.md">🇻🇪 Español (Venezuela)</a>
</div>\n\n"""

with open("README_es.md", "r") as f:
    es_content = f.read()
if "<div align=\"right\">" not in es_content:
    with open("README_es.md", "w") as f:
        f.write(nav_es + es_content)

print("Navigation bar added to READMEs.")
