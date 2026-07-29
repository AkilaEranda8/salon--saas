import zipfile
from pathlib import Path

# Source folder on disk can keep any name; archive root must be a NEW folder
# so WordPress installs cleanly even when an older broken folder remains.
PLUGIN_SLUG = 'hexaone-booking'
src = Path(r'E:\salon_v1\wordpress-plugin\hexaone-salon-booking')
zip_paths = [
    Path(r'E:\salon_v1\wordpress-plugin\hexaone-salon-booking.zip'),
    Path(r'E:\salon_v1\backend\assets\hexaone-salon-booking.zip'),
]

def build(dest: Path) -> None:
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(src.rglob('*')):
            if not path.is_file():
                continue
            arc = f'{PLUGIN_SLUG}/{path.relative_to(src).as_posix()}'
            info = zipfile.ZipInfo(arc)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
    print(dest, dest.stat().st_size)
    with zipfile.ZipFile(dest) as zf:
        for name in zf.namelist():
            print(' ', name)

for p in zip_paths:
    build(p)
