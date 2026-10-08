"""Build source and release archives without secrets or user data."""
from pathlib import Path
import zipfile, os
root = Path(__file__).resolve().parent.parent
excluded = {'node_modules', '.git', 'data', '__pycache__', '.cache'}
def include(p, release):
    rel = p.relative_to(root)
    return not (set(rel.parts) & excluded or p.name == '.env' or p.suffix in {'.zip', '.log', '.bak', '.b64'} or (not release and 'dist' in rel.parts))
files = []
for directory, dirs, names in os.walk(root):
    dirs[:] = [d for d in dirs if d not in excluded]
    files.extend(Path(directory) / n for n in names)
for name, release in [('source.zip', False), ('kigcraft-qq-release.zip', True)]:
    with zipfile.ZipFile(root / name, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in files:
            if include(p, release): z.write(p, p.relative_to(root).as_posix())
        if release: z.write(root / 'source.zip', 'source.zip')
    print(name, (root / name).stat().st_size)
