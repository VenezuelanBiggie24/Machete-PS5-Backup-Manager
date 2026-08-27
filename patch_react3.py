import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

# 1. Update TransferProgressModal to accept active prop
old_modal_def = "const TransferProgressModal = () => {"
new_modal_def = "const TransferProgressModal = ({ active }: { active: boolean }) => {"
app_tsx = app_tsx.replace(old_modal_def, new_modal_def)

app_tsx = app_tsx.replace("if (!progress) return null;", "if (!active || !progress) return null;")

# 2. Add transferActive state to App
app_tsx = app_tsx.replace("const [loading, setLoading] = useState(false);", "const [loading, setLoading] = useState(false);\n  const [transferActive, setTransferActive] = useState(false);")

# 3. Pass active to TransferProgressModal
app_tsx = app_tsx.replace("<TransferProgressModal />", "<TransferProgressModal active={transferActive} />")

# 4. Set transferActive in startTransfer
old_start = """  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
    try {
      await invoke('transfer_items', {
        sources: payload,
        targetDir: currentDirRef.current
      });
      loadDirectory(currentDirRef.current);
    } catch (e) {
      console.error(e);
      message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
    }
  };"""

new_start = """  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
    setTransferActive(true);
    try {
      await invoke('transfer_items', {
        sources: payload,
        targetDir: currentDirRef.current
      });
      loadDirectory(currentDirRef.current);
    } catch (e) {
      console.error(e);
      message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
    } finally {
      setTransferActive(false);
    }
  };"""
app_tsx = app_tsx.replace(old_start, new_start)

# 5. Add proper chunking logic to loadDirectory
old_load = """      const metaPromises = uniquePpsas.map(async (ppsa) => {
        try {
          const meta = await invoke<MetadataInfo>('fetch_metadata_rs', { ppsa });
          return { ppsa, meta };
        } catch (e) {
          console.error(`Failed to fetch metadata for ${ppsa}`, e);
          return { ppsa, meta: null };
        }
      });
      
      const metaResults = await Promise.all(metaPromises);
      
      const metaDict: Record<string, MetadataInfo> = {};
      metaResults.forEach(r => {
        if (r.meta) {
          metaDict[r.ppsa] = r.meta;
        }
      });"""

new_load = """      const metaDict: Record<string, MetadataInfo> = {};
      const CHUNK_SIZE = 5;
      
      for (let i = 0; i < uniquePpsas.length; i += CHUNK_SIZE) {
        if (currentDirRef.current !== dir) return;
        const chunk = uniquePpsas.slice(i, i + CHUNK_SIZE);
        const metaPromises = chunk.map(async (ppsa) => {
          try {
            const meta = await invoke<MetadataInfo>('fetch_metadata_rs', { ppsa });
            return { ppsa, meta };
          } catch (e) {
            console.error(`Failed to fetch metadata for ${ppsa}`, e);
            return { ppsa, meta: null };
          }
        });
        const metaResults = await Promise.all(metaPromises);
        metaResults.forEach(r => {
          if (r.meta) {
            metaDict[r.ppsa] = r.meta;
          }
        });
      }
      
      if (currentDirRef.current !== dir) return;"""
app_tsx = app_tsx.replace(old_load, new_load)

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)

print("React chunking and modal active state patched.")
