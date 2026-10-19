from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICONS = ROOT / "icons"
ASSETS.mkdir(exist_ok=True)
ICONS.mkdir(exist_ok=True)

def font(size, bold=False):
    names = ["segoeuib.ttf" if bold else "segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf"]
    for name in names:
        for path in [Path("C:/Windows/Fonts") / name, Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")]:
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    return ImageFont.load_default()

def make_icon(size):
    scale = 4
    s = size * scale
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    pixels = image.load()
    top = (100, 119, 244)
    bottom = (43, 60, 166)
    for y in range(s):
        for x in range(s):
            t = min(1, max(0, .16 + .58 * y / s + .24 * x / s))
            pixels[x, y] = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * .25), fill=255)
    image.putalpha(mask)
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    card = (int(s * .16), int(s * .16), int(s * .84), int(s * .86))
    shadow_draw.rounded_rectangle((card[0], card[1] + int(s * .025), card[2], card[3] + int(s * .025)), radius=int(s * .105), fill=(24, 34, 106, 85))
    image = Image.alpha_composite(image, shadow.filter(ImageFilter.GaussianBlur(int(s * .025))))
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = card
    draw.rounded_rectangle(card, radius=int(s * .105), fill="#ffffff")
    header_bottom = int(s * .375)
    draw.rounded_rectangle((x0, y0, x1, header_bottom), radius=int(s * .105), fill="#edf0ff")
    draw.rectangle((x0, header_bottom - int(s * .06), x1, header_bottom), fill="#edf0ff")
    for x in (int(s * .34), int(s * .66)):
        draw.rounded_rectangle((x - int(s * .025), int(s * .095), x + int(s * .025), int(s * .29)), radius=int(s * .025), fill="#c8d0ff")
        draw.ellipse((x-int(s*.035), int(s*.275), x+int(s*.035), int(s*.32)), fill="#687be8")
    cell = int(s * .092)
    gap = int(s * .034)
    grid_width = cell * 4 + gap * 3
    grid_x = (s - grid_width) // 2
    grid_y = int(s * .445)
    for row in range(3):
        for col in range(4):
            left = grid_x + col * (cell + gap)
            top_y = grid_y + row * (cell + gap)
            tile = (left, top_y, left + cell, top_y + cell)
            if row == 1 and col == 2:
                draw.rounded_rectangle(tile, radius=int(s*.022), fill="#f58b72")
                dot = max(2, int(s * .012))
                cx, cy = left + cell // 2, top_y + cell // 2
                draw.ellipse((cx-dot, cy-dot, cx+dot, cy+dot), fill="#ffffff")
            else:
                fill = "#dce4f8" if (row + col) % 3 else "#d4f0e7"
                draw.rounded_rectangle(tile, radius=int(s*.022), fill=fill)
    return image.resize((size, size), Image.Resampling.LANCZOS)

for size in (16, 32, 48, 128):
    make_icon(size).save(ICONS / f"{size}.png", optimize=True)

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def draw_brand_mark(draw, x, y, size):
    s = size
    rounded(draw, (x, y, x+s, y+s), int(s*.24), "#4057d6")
    left, top, right, bottom = x+int(s*.19), y+int(s*.20), x+int(s*.81), y+int(s*.82)
    rounded(draw, (left, top, right, bottom), int(s*.10), "#ffffff")
    draw.rounded_rectangle((left, top, right, y+int(s*.43)), radius=int(s*.10), fill="#edf0ff")
    draw.rectangle((left, y+int(s*.36), right, y+int(s*.44)), fill="#edf0ff")
    for xx in (x+int(s*.36), x+int(s*.64)):
        draw.rounded_rectangle((xx-int(s*.035), y+int(s*.11), xx+int(s*.035), y+int(s*.34)), radius=max(1,int(s*.03)), fill="#9ba9f4")
    cell, gap = int(s*.105), int(s*.07)
    start_x, start_y = x+int(s*.245), y+int(s*.51)
    for row in range(3):
        for col in range(3):
            xx, yy = start_x+col*(cell+gap), start_y+row*(cell+gap)
            fill = "#f58b72" if row == 1 and col == 1 else "#dce4f8"
            rounded(draw, (xx, yy, xx+cell, yy+cell), max(1,int(s*.025)), fill)

def draw_screen(draw, ox, oy, scale=1):
    def box(values):
        return tuple(int(v * scale) + (ox if i % 2 == 0 else oy) for i, v in enumerate(values))
    card = box((0, 0, 444, 664))
    rounded(draw, card, int(24*scale), "#ffffff", "#eceef5", max(1, int(scale)))
    # Header and icon
    draw_brand_mark(draw, int(ox+24*scale), int(oy+22*scale), int(34*scale))
    draw.text((ox+68*scale, oy+20*scale), "daybeam", font=font(int(17*scale), True), fill="#202538")
    draw.text((ox+68*scale, oy+42*scale), "your day, in view", font=font(int(9*scale)), fill="#8a90a2")
    draw.ellipse(box((393, 27, 405, 39)), outline="#858b9e", width=max(1, int(1.5*scale)))
    draw.ellipse(box((397, 31, 401, 35)), fill="#858b9e")
    draw.line((ox+399*scale, oy+24*scale, ox+399*scale, oy+27*scale), fill="#858b9e", width=max(1, int(1.5*scale)))
    draw.line((ox+399*scale, oy+39*scale, ox+399*scale, oy+42*scale), fill="#858b9e", width=max(1, int(1.5*scale)))
    draw.text((ox+26*scale, oy+84*scale), "MONDAY, OCTOBER 19", font=font(int(9*scale), True), fill="#858ba0")
    draw.text((ox+26*scale, oy+101*scale), "Coming up", font=font(int(23*scale), True), fill="#202538")
    rounded(draw, box((335, 101, 419, 132)), int(9*scale), "#4057d6")
    draw.text((ox+350*scale, oy+109*scale), "+  Add event", font=font(int(10*scale), True), fill="#ffffff")
    rounded(draw, box((25, 151, 419, 190)), int(10*scale), "#f3f4f9")
    for i, label in enumerate(("Agenda", "Day", "Week", "Month", "Year")):
        x = 29 + i*78
        if i == 0:
            rounded(draw, box((x, 155, x+76, 186)), int(7*scale), "#ffffff")
            color = "#4057d6"
        else:
            color = "#8a8fa0"
        draw.text((ox+(x+20)*scale, oy+164*scale), label, font=font(int(9*scale), True), fill=color)
    draw.text((ox+26*scale, oy+210*scale), "Today", font=font(int(12*scale), True), fill="#373d52")
    draw.text((ox+369*scale, oy+212*scale), "3 events", font=font(int(9*scale)), fill="#9ba0af")
    events = [("9:30 AM", "Design stand-up", "Studio · 20 min", "#ef9b6b"),
              ("11:00 AM", "Project check-in", "Video call · 30 min", "#4057d6"),
              ("2:00 PM", "Coffee with Maya", "Juniper Café · 1 hr", "#49b990"),
              ("4:30 PM", "Plan the week", "Personal · 30 min", "#a085dc")]
    for index, (time, title, meta, accent) in enumerate(events):
        top = 232 + index*87
        rounded(draw, box((25, top, 419, top+75)), int(11*scale), "#ffffff", "#edf0f5", max(1, int(scale)))
        draw.rounded_rectangle(box((37, top+13, 41, top+62)), radius=int(2*scale), fill=accent)
        draw.text((ox+54*scale, oy+(top+12)*scale), title, font=font(int(12*scale), True), fill="#30364b")
        draw.text((ox+54*scale, oy+(top+38)*scale), time, font=font(int(9*scale)), fill="#7d8395")
        draw.text((ox+140*scale, oy+(top+38)*scale), "·  "+meta, font=font(int(9*scale)), fill="#9ba0af")

def make_promo(path, width, height, tile=False):
    image = Image.new("RGB", (width, height), "#f5f6fb")
    draw = ImageDraw.Draw(image)
    if tile:
        # Compact store tile that stays legible at Chrome Web Store's listing size.
        draw.ellipse((width-190, -120, width+70, 140), fill="#e9ecff")
        draw_brand_mark(draw, 22, 24, 50)
        draw.text((87, 29), "daybeam", font=font(24, True), fill="#202538")
        draw.text((87, 57), "CALENDAR COMPANION", font=font(9, True), fill="#848a9d")
        draw.text((26, 100), "Your day,", font=font(29, True), fill="#202538")
        draw.text((26, 135), "in view.", font=font(29, True), fill="#4057d6")
        draw.text((27, 183), "A calm, quick way to stay ahead", font=font(12), fill="#73798d")
        draw.text((27, 201), "of your Google Calendar.", font=font(12), fill="#73798d")
        draw_screen(draw, 257, 24, .38)
    else:
        draw.ellipse((70, 535, 390, 855), fill="#e9f7f2")
        draw.ellipse((230, -120, 600, 250), fill="#eef0ff")
        draw_brand_mark(draw, 92, 105, 62)
        draw.text((174, 106), "daybeam", font=font(27, True), fill="#202538")
        draw.text((175, 141), "CALENDAR COMPANION FOR CHROME", font=font(10, True), fill="#858b9e")
        draw.text((90, 233), "Your day,", font=font(56, True), fill="#202538")
        draw.text((90, 300), "in view.", font=font(56, True), fill="#4057d6")
        draw.text((94, 392), "See what’s next, add plans in seconds,", font=font(16), fill="#72798d")
        draw.text((94, 420), "and get a gentle nudge before it’s time to go.", font=font(16), fill="#72798d")
        for i, text in enumerate(("Quick event creation", "Snoozable desktop reminders", "Month, week, day and agenda views")):
            yy = 499 + i*41
            draw.ellipse((96, yy, 116, yy+20), fill="#e5f6ef")
            draw.line((101, yy+10, 105, yy+14, 112, yy+6), fill="#38a879", width=2)
            draw.text((129, yy+1), text, font=font(14, True), fill="#4f566b")
        # soft shadow behind the calendar mockup
        shadow = Image.new("RGBA", (width, height), (0,0,0,0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle((666, 47, 1164, 760), radius=35, fill=(38,48,91,52))
        image = Image.alpha_composite(image.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(22))).convert("RGB")
        draw = ImageDraw.Draw(image)
        draw_screen(draw, 646, 42, 1.08)
    image.save(path, optimize=True)

make_promo(ASSETS / "daybeam-store-tile.png", 440, 280, tile=True)
make_promo(ASSETS / "daybeam-preview-1280x800.png", 1280, 800)
