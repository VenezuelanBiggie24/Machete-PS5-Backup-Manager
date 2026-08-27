import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

# 1. Fix loadDirectory race condition and Promise.all IPC flooding
old_load_dir = """  const loadDirectory = async (dir: string) => {
    try {
      setLoading(true);
      const result: any[] = await invoke('read_directory', { path: dir });
      
      const ppsaMap = new Map();
      result.forEach(file => {
        if (file.ppsa && !ppsaMap.has(file.ppsa)) {
          ppsaMap.set(file.ppsa, file);
        }
      });
      
      const metaPromises = Array.from(ppsaMap.keys()).map(async (ppsa) => {
        try {
          const meta: any = await invoke('fetch_metadata_rs', { ppsa });
          return { ppsa, meta };
        } catch (e) {
          return { ppsa, meta: { title: null, cover: null, region_flag: null } };
        }
      });
      
      const metaResults = await Promise.all(metaPromises);
      
      const metaDict: Record<string, any> = {};
      metaResults.forEach(r => {
        metaDict[r.ppsa] = r.meta;
      });
      
      setMetadata(metaDict);
      setFiles(result);
    } catch (e) {
      console.error(e);
      message("Error reading directory: " + String(e), { title: "Error", kind: 'error' });
    } finally {
      setLoading(false);
    }
  };"""

new_load_dir = """  const loadDirectory = async (dir: string) => {
    try {
      setLoading(true);
      const result: any[] = await invoke('read_directory', { path: dir });
      
      const ppsaMap = new Map();
      result.forEach(file => {
        if (file.ppsa && !ppsaMap.has(file.ppsa)) {
          ppsaMap.set(file.ppsa, file);
        }
      });
      
      const uniquePpsas = Array.from(ppsaMap.keys());
      const metaDict: Record<string, any> = {};
      
      // Fetch in chunks to avoid IPC flooding
      const CHUNK_SIZE = 5;
      for (let i = 0; i < uniquePpsas.length; i += CHUNK_SIZE) {
        if (currentDirRef.current !== dir) return; // Early exit race condition
        const chunk = uniquePpsas.slice(i, i + CHUNK_SIZE);
        const metaPromises = chunk.map(async (ppsa) => {
          try {
            const meta: any = await invoke('fetch_metadata_rs', { ppsa });
            return { ppsa, meta };
          } catch (e) {
            return { ppsa, meta: { title: null, cover: null, region_flag: null } };
          }
        });
        
        const metaResults = await Promise.all(metaPromises);
        metaResults.forEach(r => {
          metaDict[r.ppsa] = r.meta;
        });
      }
      
      if (currentDirRef.current !== dir) return; // Early exit before setting state
      setMetadata(metaDict);
      setFiles(result);
    } catch (e) {
      console.error(e);
      message("Error reading directory: " + String(e), { title: "Error", kind: 'error' });
    } finally {
      setLoading(false);
    }
  };"""
app_tsx = app_tsx.replace(old_load_dir, new_load_dir)

# 2. Fix handleSelectDirectory currentDirRef update
old_select = """  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        setCurrentDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };"""

new_select = """  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        currentDirRef.current = selected;
        setCurrentDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };"""
app_tsx = app_tsx.replace(old_select, new_select)


with open("src/App.tsx", "w") as f:
    f.write(app_tsx)

print("React code patched part 2 successfully.")
