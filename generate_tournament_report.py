# -*- coding: utf-8 -*-
"""
Tournament Report Generator (PDF)
- Page 1: header = logo + red line; body = centered title; right-aligned "Тренер: …";
          footer at absolute bottom = "19 октября 2025 года" (left) and "г. Алматы" (right)
          + one empty line ("enter") under it.
- Subsequent non-round pages: logo + red line; content tight to the line.
- Rounds pages: NO logo, NO line; start from the very top.
"""

from __future__ import annotations
import json
import os
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate, PageBreak,
    Table, TableStyle, Paragraph, Spacer, FrameBreak, KeepInFrame
)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ----------------------------------------------------------------------------------
# Page geometry & constants
# ----------------------------------------------------------------------------------
PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN  = 24
RIGHT_MARGIN = 24
TOP_MARGIN   = 40
BOTTOM_MARGIN= 24

HEADER_RESERVE = 90     # space reserved above the text frame for logo + line
FOOTER_HEIGHT  = 44     # footer tall enough for date/location + one blank line
FRAME_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

CONTENT_TOP_SPACER = 6  # tiny pad below header line

# ----------------------------------------------------------------------------------
# Branding & Config
# ----------------------------------------------------------------------------------
RED = colors.HexColor("#c1121f")
LIGHT_RED = colors.Color(RED.red, RED.green, RED.blue, alpha=0.06)

TEACHER_NAME = "Утегенов Мурат"
LOGO_REL_PATH = "public/logo.png"

DEFAULT_DESK_WEIGHT_SCALE = 0.5
DEFAULT_BLACK_BONUS = 0.10

# ----------------------------------------------------------------------------------
# Fonts (Times New Roman preferred, with Cyrillic; fallbacks if missing)
# ----------------------------------------------------------------------------------
def pick_cyrillic_font() -> Tuple[str, str]:
    candidates = [
        # Preferred: Times New Roman on Windows
        (r"C:\Windows\Fonts\times.ttf",    r"C:\Windows\Fonts\timesbd.ttf"),
        (r"C:\Windows\Fonts\Times.ttf",    r"C:\Windows\Fonts\Timesbd.ttf"),
        (r"C:\Windows\Fonts\times.TTF",    r"C:\Windows\Fonts\timesbd.TTF"),
        # Common local copies next to script
        ("Times New Roman.ttf", "Times New Roman Bold.ttf"),
        ("times.ttf", "timesbd.ttf"),
        # Fallbacks with Cyrillic coverage
        ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
        ("NotoSerif-Regular.ttf", "NotoSerif-Bold.ttf"),
        ("NotoSans-Regular.ttf", "NotoSans-Bold.ttf"),
        (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        (r"C:\Windows\Fonts\tahoma.ttf", r"C:\Windows\Fonts\tahomabd.ttf"),
        (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"),
    ]
    here = Path(__file__).parent.resolve()

    def exists(p: str) -> Optional[str]:
        if os.path.exists(p):
            return p
        pp = here / p
        return str(pp) if pp.exists() else None

    for reg, bold in candidates:
        regp = exists(reg)
        if regp:
            boldp = exists(bold) or regp
            return regp, boldp
    raise FileNotFoundError(
        "Times New Roman not found. Place 'times.ttf'/'timesbd.ttf' (or DejaVu/Noto) next to the script, "
        "or ensure system fonts are available."
    )

REG_PATH, BOLD_PATH = pick_cyrillic_font()
pdfmetrics.registerFont(TTFont("RU-Regular", REG_PATH))
pdfmetrics.registerFont(TTFont("RU-Bold", BOLD_PATH))

styles = getSampleStyleSheet()
# Title in Times New Roman Bold, red
styles.add(ParagraphStyle(name="TitleRU", parent=styles["Title"], fontName="RU-Bold", textColor=RED))
styles.add(ParagraphStyle(name="H2RU", parent=styles["Heading2"], fontName="RU-Bold", textColor=RED, spaceAfter=8))
styles.add(ParagraphStyle(name="H3RU", parent=styles["Heading3"], fontName="RU-Bold", textColor=RED, spaceAfter=6))
styles.add(ParagraphStyle(name="NormalRU", parent=styles["Normal"], fontName="RU-Regular", leading=14))
styles.add(ParagraphStyle(name="SmallRU", parent=styles["Normal"], fontName="RU-Regular", fontSize=10, leading=13, textColor=colors.black))

# Centered tidy body text
styles.add(ParagraphStyle(
    name="CenteredRU",
    parent=styles["Normal"],
    alignment=1,           # center
    fontName="RU-Bold",
    fontSize=14,
    leading=18,
))
styles.add(ParagraphStyle(
    name="SmallCenteredRU",
    parent=styles["Normal"],
    alignment=1,           # center
    fontName="RU-Regular",
    fontSize=11,
    leading=14,
))
# Right-aligned teacher line
styles.add(ParagraphStyle(
    name="SmallRightRU",
    parent=styles["Normal"],
    alignment=2,           # right
    fontName="RU-Bold",
    fontSize=11,
    leading=14,
    textColor=RED,
))

# ----------------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------------
def load_db(path="db.json") -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def idx_by(lst: List[Dict[str, Any]], key="id") -> Dict[str, Dict[str, Any]]:
    return {x.get(key): x for x in lst if x.get(key) is not None}

def pick_latest_results(tr_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not tr_list:
        return None
    by_id = {x.get("id"): x for x in tr_list if x.get("id")}
    if "live" in by_id:
        return by_id["live"]
    def ts(x: Dict[str, Any]) -> datetime:
        try:
            return datetime.fromisoformat(x.get("finalized_at", "").replace("Z", "+00:00"))
        except Exception:
            return datetime.min
    return sorted(tr_list, key=ts, reverse=True)[0]

def find_logo_path() -> Optional[str]:
    here = Path(__file__).parent.resolve()
    p = here / LOGO_REL_PATH
    return str(p) if p.exists() else None

def table_with_style(data, colWidths=None, zebra=False, red_header=True, align_body="LEFT"):
    if colWidths is not None:
        try:
            total = float(sum(colWidths))
            if total > FRAME_WIDTH:
                scale = FRAME_WIDTH / total
                colWidths = [w*scale for w in colWidths]
        except Exception:
            pass
    from reportlab.platypus import Table
    t = Table(data, hAlign="LEFT", colWidths=colWidths, repeatRows=1)
    style = [
        ("GRID", (0,0), (-1,-1), 0.6, colors.black),
        ("FONTNAME", (0,0), (-1,0), "RU-Bold"),
        ("FONTNAME", (0,1), (-1,-1), "RU-Regular"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("WORDWRAP", (0,0), (-1,-1), True),
        ("ALIGN", (0,0), (-1,0), "CENTER"),
        ("ALIGN", (0,1), (-1,-1), align_body),
    ]
    if red_header:
        style += [("BACKGROUND", (0,0), (-1,0), RED), ("TEXTCOLOR", (0,0), (-1,0), colors.white)]
    else:
        style += [("BACKGROUND", (0,0), (-1,0), colors.lightgrey)]
    if zebra and len(data) > 2:
        for r in range(1, len(data)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0,r), (-1,r), LIGHT_RED))
    t.setStyle(TableStyle(style))
    return t

def get_tb_settings(latest: Optional[Dict[str, Any]]) -> Tuple[float, float]:
    if latest and latest.get("tb_settings"):
        a = latest["tb_settings"].get("desk_weight_scale", DEFAULT_DESK_WEIGHT_SCALE)
        b = latest["tb_settings"].get("black_bonus", DEFAULT_BLACK_BONUS)
        return float(a), float(b)
    return DEFAULT_DESK_WEIGHT_SCALE, DEFAULT_BLACK_BONUS

def desk_weight(desk: int, max_desk: int, alpha: float) -> float:
    if max_desk <= 1:
        return 1.0
    return 1.0 + alpha * (max_desk - desk) / (max_desk - 1)

def parse_result_to_points(res: str) -> Tuple[float, float]:
    m = (res or "").strip().replace("½", "0.5")
    if m == "1-0": return 1.0, 0.0
    if m == "0-1": return 0.0, 1.0
    if m in ("0.5-0.5","0.5 — 0.5","0.5 - 0.5","0.5–0.5"): return 0.5, 0.5
    return 0.0, 0.0

def who_is_black(br: Dict[str, Any]) -> Optional[str]:
    if "a_is_black" in br: return "A" if br["a_is_black"] else "B"
    if "b_is_black" in br: return "B" if br["b_is_black"] else "A"
    if "player_a_color" in br: return "A" if str(br["player_a_color"]).lower() == "black" else "B"
    if "player_b_color" in br: return "B" if str(br["player_b_color"]).lower() == "black" else "A"
    if "a_color" in br: return "A" if str(br["a_color"]).lower() == "black" else "B"
    if "b_color" in br: return "B" if str(br["b_color"]).lower() == "black" else "A"
    if "black_is" in br:
        v = str(br["black_is"]).upper()
        return "A" if v == "A" else ("B" if v == "B" else None)
    return None

# ----------------------------------------------------------------------------------
# NEW: Compute TEAM standings using MATCH points (W=1, D=0.5, L=0)
# ----------------------------------------------------------------------------------
def compute_team_match_standings(latest: Optional[Dict[str, Any]], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    teams = data.get("teams", []) or []
    pairings = data.get("pairings", []) or []
    boards = data.get("board_results", []) or []
    players = data.get("players", []) or []

    teams_by_id = idx_by(teams)
    players_by_id = idx_by(players)

    # tb settings
    alpha, beta = get_tb_settings(latest)

    # max desk for weights
    max_desk = 1
    for br in boards:
        d = br.get("desk_number", 1) or 1
        try: d = int(d)
        except: d = 1
        if d > max_desk: max_desk = d

    # group boards by pairing
    boards_by_pairing: Dict[Any, List[Dict[str, Any]]] = {}
    for br in boards:
        boards_by_pairing.setdefault(br.get("pairing_id"), []).append(br)

    # accumulators
    match_pts: Dict[Any, float] = {}
    match_w: Dict[Any, int] = {}
    match_d: Dict[Any, int] = {}
    match_l: Dict[Any, int] = {}
    tb_desk_map: Dict[Any, float] = {}
    tb_black_map: Dict[Any, float] = {}

    def inc(dct, k, v):
        dct[k] = dct.get(k, 0) + v

    # per pairing compute board totals → award match points
    for p in pairings:
        if p.get("is_bye"):
            # if you later want byes to count as wins, adjust here; for now ignore
            continue
        ta = p.get("team_a_id")
        tb = p.get("team_b_id")
        if ta is None or tb is None:
            continue

        a_board = 0.0
        b_board = 0.0

        for br in sorted(boards_by_pairing.get(p.get("id"), []), key=lambda x: x.get("desk_number", 0)):
            # per-board points
            a_pts, b_pts = parse_result_to_points(br.get("result", ""))
            a_board += a_pts
            b_board += b_pts

            # tb desk/black contributions
            desk = br.get("desk_number", 1) or 1
            try: desk = int(desk)
            except: desk = 1
            w = desk_weight(desk, max_desk, alpha)

            black_side = who_is_black(br)   # "A" or "B" or None
            # Desk TB
            inc(tb_desk_map, ta, a_pts * w)
            inc(tb_desk_map, tb, b_pts * w)
            # Black TB
            if black_side == "A":
                inc(tb_black_map, ta, a_pts * (1.0 + beta))
                inc(tb_black_map, tb, b_pts)
            elif black_side == "B":
                inc(tb_black_map, tb, b_pts * (1.0 + beta))
                inc(tb_black_map, ta, a_pts)
            else:
                inc(tb_black_map, ta, a_pts)
                inc(tb_black_map, tb, b_pts)

        # award match points
        if a_board > b_board:
            inc(match_pts, ta, 1.0)
            inc(match_w, ta, 1)
            inc(match_l, tb, 1)
            inc(match_pts, tb, 0.0)
        elif a_board < b_board:
            inc(match_pts, tb, 1.0)
            inc(match_w, tb, 1)
            inc(match_l, ta, 1)
            inc(match_pts, ta, 0.0)
        else:
            inc(match_pts, ta, 0.5)
            inc(match_pts, tb, 0.5)
            inc(match_d, ta, 1)
            inc(match_d, tb, 1)

    # build rows for all teams (even if 0 values)
    rows: List[Dict[str, Any]] = []
    for t in teams:
        tid = t.get("id")
        rows.append({
            "team_id": tid,
            "name": t.get("name", ""),
            "points": float(match_pts.get(tid, 0.0)),  # MATCH points for standings
            "wdl": {
                "wins": int(match_w.get(tid, 0)),
                "draws": int(match_d.get(tid, 0)),
                "losses": int(match_l.get(tid, 0)),
            },
            "tb_desk": float(tb_desk_map.get(tid, 0.0)),
            "tb_black": float(tb_black_map.get(tid, 0.0)),
        })

    # Sort: Points ↓, TB-Desk ↓, TB-Black ↓, Wins ↓, Name ↑ (as in methodology)
    def keyf(r):
        return (
            r.get("points", 0.0),
            r.get("tb_desk", 0.0),
            r.get("tb_black", 0.0),
            r.get("wdl", {}).get("wins", 0),
            # name ascending; for descending numeric we invert later
        )

    rows.sort(key=lambda r: (
        -r.get("points", 0.0),
        -r.get("tb_desk", 0.0),
        -r.get("tb_black", 0.0),
        -r.get("wdl", {}).get("wins", 0),
        r.get("name", ""),
    ))
    return rows

# ----------------------------------------------------------------------------------
# Header drawing (PageTemplates)
# ----------------------------------------------------------------------------------
def draw_header(canvas, doc, *, show_logo=True, show_line=True):
    """
    Draw logo (optional) and a red line aligned with the top of the text frame.
    """
    canvas.saveState()
    w, h = A4
    left  = doc.leftMargin
    right = w - doc.rightMargin

    frame_top_y = doc.bottomMargin + doc.height - HEADER_RESERVE  # top of main frame area

    if show_logo:
        logo_path = find_logo_path()
        if logo_path:
            target_w = 260
            target_h = 80
            canvas.drawImage(
                logo_path,
                left,
                frame_top_y + 8,  # sits above the line
                width=target_w,
                height=target_h,
                preserveAspectRatio=True,
                mask="auto",
            )

    if show_line:
        canvas.setStrokeColor(RED)
        canvas.setLineWidth(1.6)
        canvas.line(left, frame_top_y, right, frame_top_y)

    canvas.restoreState()

def header_first(canvas, doc):   # Page 1: logo + line
    draw_header(canvas, doc, show_logo=True, show_line=True)

def header_default(canvas, doc): # Subsequent: logo + line
    draw_header(canvas, doc, show_logo=True, show_line=True)

def header_nologo(canvas, doc):  # Continuations (non-rounds): no logo, keep the line
    draw_header(canvas, doc, show_logo=False, show_line=True)

def header_none(canvas, doc):    # Rounds: no logo, NO line
    return

# ----------------------------------------------------------------------------------
# Sections (Page 1)
# ----------------------------------------------------------------------------------
def add_title_page(flow, latest):
    """Body of the first page (header already draws logo + line)."""
    # Slightly smaller spacer so text safely fits above footer
    flow.append(Spacer(1, 160))

    # Centered multi-line title block
    flow.append(Paragraph("YOUNG GENIUS CHESS CUP", styles["TitleRU"]))
    flow.append(Spacer(1, 20))
    flow.append(Paragraph(
        "Шахматный турнир в преддверии празднования<br/>"
        "Дня Республики Казахстан<br/>"
        "среди студентов и профессорско-преподавательского состава<br/>"
        "Университета «Нархоз»",
        styles["CenteredRU"]
    ))
    flow.append(Spacer(1, 24))

    # Teacher — right aligned, on its own line
    flow.append(Paragraph(f"Тренер: {TEACHER_NAME}", styles["SmallRightRU"]))

    # Switch to footer frame for bottom date/location (and one empty line)
    flow.append(FrameBreak())

    footer_items = [
        Table(
            [[Paragraph("19 октября 2025 года", styles["SmallRU"]),
              Paragraph("г. Алматы", styles["SmallRU"])]],
            hAlign="LEFT",
            colWidths=[FRAME_WIDTH/2.0, FRAME_WIDTH/2.0]
        ),
        Spacer(1, 6),  # <- one empty line "enter" under the date/location
    ]
    footer_items[0].setStyle(TableStyle([
        ("ALIGN", (0,0), (0,0), "LEFT"),
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))

    # Keep the footer safely inside its frame; shrink if ever needed
    kif = KeepInFrame(FRAME_WIDTH, FOOTER_HEIGHT, footer_items, mode="shrink")
    flow.append(kif)

# ----------------------------------------------------------------------------------
# Other sections
# ----------------------------------------------------------------------------------
def add_methodology_page(flow, latest, data):
    alpha, beta = get_tb_settings(latest)
    flow.append(PageBreak())
    flow.append(Spacer(1, 140))
    flow.append(Paragraph("Методика и проверяемость расчётов", styles["H2RU"]))
    flow.append(NextPageTemplate("NoLogo"))
    flow.append(Paragraph(
        "Настоящий отчёт формализует процедуру подсчёта результатов по командам и игрокам с "
        "прозрачной реконструкцией всех промежуточных шагов и проверок. Методика применима к "
        "турнирам с фиксированной нумерацией досок и классической шкалой очков.", styles["NormalRU"]))
    flow.append(Spacer(1, 8))
    flow.append(Paragraph("<b>1) Базовые очки</b>.", styles["NormalRU"]))
    flow.append(Paragraph(
        "На каждой доске присваиваются очки: победа = 1, ничья = 0.5, поражение = 0. "
        "Командный счёт в матче — сумма очков игроков команды на соответствующих досках. "
        "Личный результат игрока — сумма его очков по всем турам.", styles["NormalRU"]))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("<b>2) Вес доски (TB-Desk)</b>.", styles["NormalRU"]))
    flow.append(Paragraph(
        "W(d) = 1 + α·(Dmax − d)/(Dmax − 1), где d — номер доски, Dmax — число досок в матче, "
        f"α = {alpha:.2f}. Тай-брейк TB-Desk — сумма произведений очков на веса.", styles["NormalRU"]))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("<b>3) Бонус за игру чёрными (TB-Black)</b>.", styles["NormalRU"]))
    flow.append(Paragraph(
        f"Очки, набранные чёрными, умножаются на (1 + β), β = {beta:.2f}. "
        "Если цвет не указан, бонус не применяется, а TB-Black берётся из данных.", styles["NormalRU"]))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("<b>4) Порядок сравнения</b>.", styles["NormalRU"]))
    flow.append(Paragraph(
        "Points ↓, затем TB-Desk ↓, затем TB-Black ↓, затем число побед ↓, затем алфавит.", styles["NormalRU"]))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("<b>5) Проверяемость</b>.", styles["NormalRU"]))
    flow.append(Paragraph(
        "Далее приведены таблицы-восстановления вкладов по доскам, матчам и цветам.", styles["NormalRU"]))
    flow.append(NextPageTemplate("Default"))

def add_team_standings_page(flow, latest, data):
    flow.append(PageBreak())
    flow.append(Paragraph("Командный зачёт", styles["H2RU"]))
    flow.append(NextPageTemplate("NoLogo"))
    flow.append(Spacer(1, CONTENT_TOP_SPACER))

    # --- CHANGED: recompute match-based team standings instead of trusting snapshot points ---
    ts = compute_team_match_standings(latest, data)
    if not ts:
        flow.append(Paragraph("Нет данных по командному зачёту.", styles["NormalRU"]))
        flow.append(NextPageTemplate("Default"))
        return

    tbl = [["Место", "Команда", "Очки", "Победы", "Ничьи", "Пораж.", "TB-Desk", "TB-Black"]]
    for i, row in enumerate(ts, start=1):
        wdl = row.get("wdl", {})
        tbl.append([
            i, row.get("name",""), f"{float(row.get('points',0.0)):.1f}",
            wdl.get("wins",0), wdl.get("draws",0), wdl.get("losses",0),
            f"{float(row.get('tb_desk',0.0)):.2f}", f"{float(row.get('tb_black',0.0)):.2f}",
        ])
    flow.append(table_with_style(tbl, colWidths=[45, 180, 50, 50, 50, 55, 60, 60], zebra=True))
    flow.append(NextPageTemplate("Default"))

def add_player_standings_section(flow, latest, data):
    ps = latest.get("player_standings", []) if latest else []

    flow.append(PageBreak())
    flow.append(NextPageTemplate("Default"))
    flow.append(Paragraph("Личный зачёт", styles["H2RU"]))
    flow.append(Spacer(1, CONTENT_TOP_SPACER))

    teams_by_id = idx_by(data.get("teams", []))
    if not ps:
        flow.append(Paragraph("Нет данных по личному зачёту.", styles["NormalRU"]))
        flow.append(NextPageTemplate("Default"))
        return

    tbl = [["Место","Игрок","Команда","Доска","Очки","В","Н","П","TB-Desk","TB-Black"]]
    for i, row in enumerate(ps, start=1):
        team_name = teams_by_id.get(row.get("team_id"),{}).get("name","")
        tbl.append([
            i, row.get("full_name",""), team_name,
            row.get("desk_number",""), row.get("points",""),
            row.get("wins",0), row.get("draws",0), row.get("losses",0),
            row.get("tb_desk",""), row.get("tb_black",""),
        ])

    flow.append(NextPageTemplate("NoLogo"))
    flow.append(table_with_style(tbl, colWidths=[45,160,140,45,45,30,30,30,55,55], zebra=True))
    flow.append(NextPageTemplate("Default"))

def add_board_prizes_page(flow, latest, data):
    flow.append(PageBreak())
    flow.append(Paragraph("Призы по доскам", styles["H2RU"]))
    flow.append(NextPageTemplate("NoLogo"))
    flow.append(Spacer(1, CONTENT_TOP_SPACER))

    teams_by_id = idx_by(data.get("teams", []))
    bp = latest.get("board_prizes", []) if latest else []
    ps = latest.get("player_standings", []) if latest else []

    def derive_by_desk(desk_num: int) -> List[Dict[str, Any]]:
        rows = [r for r in ps if r.get("desk_number")==desk_num]
        def keyf(r):
            return (float(r.get("points",0)), float(r.get("tb_desk",0)), float(r.get("tb_black",0)))
        rows.sort(key=keyf, reverse=True)
        return rows[:2]

    prizes_map: Dict[int, Dict[str, Any]] = {}
    for item in bp:
        d = item.get("desk_number")
        if d is None: continue
        prizes_map.setdefault(d, {}).update(item)

    all_desks = set(prizes_map.keys()) | set([r.get("desk_number") for r in ps if r.get("desk_number") is not None])
    rows = [["Доска","Победитель","Команда","Очки","2 место","Команда","Очки"]]
    proof_header = ["Доска","Игрок","Команда","Очки","TB-Desk","TB-Black"]
    proof_rows = [proof_header]

    for d in sorted(all_desks):
        prize = prizes_map.get(d, {})
        top_two = derive_by_desk(d)
        if prize.get("full_name"):
            win_name = prize.get("full_name")
            win_team = teams_by_id.get(prize.get("team_id"),{}).get("name","")
            win_pts  = prize.get("points","")
        else:
            w = top_two[0] if top_two else {}
            win_name = w.get("full_name","—")
            win_team = teams_by_id.get(w.get("team_id"),{}).get("name","")
            win_pts  = w.get("points","—")

        if prize.get("runner_up"):
            ru = prize["runner_up"]
            ru_name = ru.get("full_name","—")
            ru_team = teams_by_id.get(ru.get("team_id"),{}).get("name","")
            ru_pts  = ru.get("points","—")
        else:
            r = top_two[1] if len(top_two) > 1 else {}
            ru_name = r.get("full_name","—")
            ru_team = teams_by_id.get(r.get("team_id"),{}).get("name","")
            ru_pts  = r.get("points","—")

        rows.append([d, win_name, win_team, win_pts, ru_name, ru_team, ru_pts])

        for person in [win_name, ru_name]:
            cand = next((x for x in ps if x.get("full_name")==person and x.get("desk_number")==d), None)
            if cand:
                proof_rows.append([
                    d, person, teams_by_id.get(cand.get("team_id"),{}).get("name",""),
                    cand.get("points",""), cand.get("tb_desk",""), cand.get("tb_black",""),
                ])

    flow.append(table_with_style(rows, zebra=True, colWidths=[45,130,140,50,130,140,50]))
    flow.append(Spacer(1, 8))
    flow.append(Paragraph("Детализация по призёрам (пер-досочные тай-брейки)", styles["H3RU"]))
    flow.append(table_with_style(proof_rows, zebra=True, colWidths=[45,150,160,50,60,60], align_body="CENTER"))
    flow.append(NextPageTemplate("Default"))

def add_round_pages(flow, latest, data):
    """
    Rounds: NO logo and NO red line. Each round starts on a fresh page and
    content begins at the very top (normal top margin).
    """
    players_by_id = idx_by(data.get("players", []))
    teams_by_id   = idx_by(data.get("teams", []))
    rounds  = sorted(data.get("rounds", []), key=lambda x: x.get("round_number", 0))
    pairings= data.get("pairings", [])
    boards  = data.get("board_results", [])
    boards_by_pairing = {}
    for br in boards:
        boards_by_pairing.setdefault(br.get("pairing_id"), []).append(br)

    alpha, beta = get_tb_settings(latest)

    max_desk = 1
    for br in boards:
        d = br.get("desk_number", 1) or 1
        try: d = int(d)
        except: d = 1
        if d > max_desk: max_desk = d

    for rnd in rounds:
        flow.append(NextPageTemplate("NoHeaderFull"))
        flow.append(PageBreak())

        flow.append(Paragraph(f"Тур {rnd.get('round_number','')}", styles["H2RU"]))
        flow.append(Spacer(1, 4))

        rnd_pairings = [p for p in pairings if p.get("round_id")==rnd.get("id")]
        if not rnd_pairings:
            flow.append(Paragraph("Нет пар для этого тура.", styles["SmallRU"]))
            continue

        for p in rnd_pairings:
            ta = teams_by_id.get(p.get("team_a_id"))
            tb = teams_by_id.get(p.get("team_b_id"))
            ta_name = ta["name"] if ta else "—"
            tb_name = tb["name"] if tb else "BYE"
            a_total = float(p.get("team_a_points", 0) or 0)
            b_total = float(p.get("team_b_points", 0) or 0)

            flow.append(Paragraph(
                f"<b>{ta_name}</b> vs <b>{tb_name}</b> — Счёт матча: <b>{a_total:.2f} : {b_total:.2f}</b>",
                styles["NormalRU"]))
            flow.append(Spacer(1, 4))

            brs = sorted(boards_by_pairing.get(p.get("id"), []), key=lambda x: x.get("desk_number", 0))
            if not brs:
                flow.append(Paragraph("Нет протокола по доскам.", styles["SmallRU"]))
                flow.append(Spacer(1, 8))
                continue

            header = ["Доска","A (игрок)","B (игрок)","Результат","Очки A","Очки B","W(d)","TB-Desk A","TB-Desk B","Чёрные"]
            rows = [header]
            sum_a = 0.0
            sum_b = 0.0
            for br in brs:
                pa = players_by_id.get(br.get("player_a_id"),{}).get("full_name","—")
                pb = players_by_id.get(br.get("player_b_id"),{}).get("full_name","—")
                a_pts, b_pts = parse_result_to_points(br.get("result",""))
                sum_a += a_pts
                sum_b += b_pts
                desk = br.get("desk_number",1) or 1
                try: desk = int(desk)
                except: desk = 1
                w = desk_weight(desk, max_desk, alpha)
                rows.append([
                    desk, pa, pb, br.get("result",""), f"{a_pts:.2f}", f"{b_pts:.2f}", f"{w:.3f}",
                    f"{(a_pts*w):.3f}", f"{(b_pts*w):.3f}",
                    ("A" if who_is_black(br)=="A" else "B" if who_is_black(br)=="B" else "—")
                ])

            rows.append(["","","","Итого:", f"{sum_a:.2f}", f"{sum_b:.2f}","","","",""])
            flow.append(table_with_style(rows, zebra=True, colWidths=[40,150,150,55,45,45,45,55,55,45], align_body="CENTER"))
            flow.append(Spacer(1, 10))

    flow.append(NextPageTemplate("Default"))

def build_pdf():
    data = load_db("db.json")
    tr_list = data.get("tournament_results", [])
    latest = pick_latest_results(tr_list)
    if latest is not None and "tb_settings" not in latest:
        latest["tb_settings"] = {
            "desk_weight_scale": DEFAULT_DESK_WEIGHT_SCALE,
            "black_bonus": DEFAULT_BLACK_BONUS,
        }

    from reportlab.platypus import Frame
    doc = BaseDocTemplate(
        "tournament_report.pdf",
        pagesize=A4,
        leftMargin=LEFT_MARGIN, rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
        title="Итоговый отчёт",
        author="Chess Manager",
    )

    # Shared normal frame (reserves header area for logo + line)
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height - HEADER_RESERVE,
        id="normal"
    )
    # First page uses two frames: main + fixed footer at bottom
    frame_first_main = Frame(
        doc.leftMargin,
        doc.bottomMargin + FOOTER_HEIGHT,                     # leave room for footer
        doc.width,
        doc.height - HEADER_RESERVE - FOOTER_HEIGHT,
        id="first_main"
    )
    frame_first_footer = Frame(
        doc.leftMargin,
        doc.bottomMargin,                                     # sit on the very bottom
        doc.width,
        FOOTER_HEIGHT,
        id="first_footer"
    )
    # Full-height frame with NO header reserve (for rounds)
    frame_full = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="full"
    )

    templates = [
        PageTemplate(id="First",        frames=[frame_first_main, frame_first_footer], onPage=header_first),
        PageTemplate(id="Default",      frames=[frame],                                 onPage=header_default),
        PageTemplate(id="NoLogo",       frames=[frame],                                 onPage=header_nologo),
        PageTemplate(id="NoHeaderFull", frames=[frame_full],                            onPage=header_none),
    ]
    doc.addPageTemplates(templates)

    flow: List[Any] = []
    # Page 1 uses "First" (logo + line, bottom footer), then switch to Default
    flow.append(NextPageTemplate("First"))
    add_title_page(flow, latest)
    flow.append(NextPageTemplate("Default"))

    add_methodology_page(flow, latest, data)
    add_team_standings_page(flow, latest, data)
    add_player_standings_section(flow, latest, data)
    add_board_prizes_page(flow, latest, data)
    add_round_pages(flow, latest, data)

    doc.build(flow)
    print("✅ PDF generated: tournament_report.pdf")

if __name__ == "__main__":
    build_pdf()
