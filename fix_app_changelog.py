with open("src/App.tsx", "r") as f:
    app = f.read()

new_changelog_blocks = """
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v200_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v200_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v123_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v123_items", { returnObjects: true }))}
                  </ul>
                </div>
"""

app = app.replace('                <div>\n                  <div className="text-cyan-300 font-bold">{t("changelog_v120_title")}</div>',
                  new_changelog_blocks.strip('\n') + '\n                <div>\n                  <div className="text-cyan-300 font-bold">{t("changelog_v120_title")}</div>')

with open("src/App.tsx", "w") as f:
    f.write(app)

print("App.tsx changelog updated.")
