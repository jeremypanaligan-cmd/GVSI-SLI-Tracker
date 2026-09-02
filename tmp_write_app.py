import os
p = os.path.join("src", "App.jsx")
with open("tmp_app_content.txt", "r", encoding="utf-8") as f:
    content = f.read()
with open(p, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Written {len(content)} chars")
