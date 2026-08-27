with open("src/App.tsx", "r") as f:
    content = f.read()

# Update hardcoded version in the Info row
content = content.replace('<div className="font-semibold text-white">1.1.0</div>', '<div className="font-semibold text-white">1.2.0</div>')

# Add v1.2.0 changelog block
v120_block = """                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v120_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v120_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v110_title")}</div>"""

content = content.replace('                <div>\n                  <div className="text-cyan-300 font-bold">{t("changelog_v110_title")}</div>', v120_block)

with open("src/App.tsx", "w") as f:
    f.write(content)

print("App.tsx about section updated.")
