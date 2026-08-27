import re

with open("README.md", "r") as f:
    en_content = f.read()

en_warnings = """
> [!NOTE]  
> **Windows Users:** When running the installer for the first time, Windows SmartScreen might block it showing a blue "Windows protected your PC" screen. Simply click **"More info"** and then **"Run anyway"**.

> [!NOTE]  
> **Linux Users:** If you use the `.AppImage` format, remember to grant it execution permissions. Right-click the file -> Properties -> Permissions -> Check "Allow executing file as program", or run `chmod +x Machete*.AppImage` in your terminal.

"""

en_content = en_content.replace('### Build from Source', en_warnings + '### Build from Source')

with open("README.md", "w") as f:
    f.write(en_content)


with open("README_es.md", "r") as f:
    es_content = f.read()

es_warnings = """
> [!NOTE]  
> **Usuarios de Windows:** Al ejecutar el instalador por primera vez, es posible que salte la pantalla azul de Windows SmartScreen ("Windows protegió su PC"). Simplemente haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.

> [!NOTE]  
> **Usuarios de Linux:** Si usas el formato `.AppImage`, recuerda otorgarle permisos de ejecución antes de abrirlo. Haz clic derecho en el archivo -> Propiedades -> Permisos -> Marca "Permitir ejecutar el archivo como un programa", o ejecuta `chmod +x Machete*.AppImage` en la terminal.

"""

es_content = es_content.replace('### Compilar desde el Código Fuente', es_warnings + '### Compilar desde el Código Fuente')

with open("README_es.md", "w") as f:
    f.write(es_content)

print("Fixed padding and inserted warnings.")
