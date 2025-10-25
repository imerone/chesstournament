# -*- coding: utf-8 -*-
"""
Генератор ПДФ-листов туров для печати (до начала турнира).
Берёт пары команд и (по desk_number) формирует ведомости.
Если есть board_results — подставит текущие результаты.
Вход:  db.json
Выход: rounds_sheets.pdf
"""

import json
import os
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, PageBreak, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# --------- Поиск кириллических шрифтов (Windows + локальные варианты) ---------
def pick_cyrillic_font():
    """Возвращает (regular_path, bold_path) для шрифта с поддержкой кириллицы."""
    candidates = [
        # локальные рядом со скриптом
        ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
        ("NotoSans-Regular.ttf", "NotoSans-Bold.ttf"),
        ("NotoSerif-Regular.ttf", "NotoSerif-Bold.ttf"),
        ("Roboto-Regular.ttf", "Roboto-Bold.ttf"),
        # Windows
        (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"),
        (r"C:\Windows\Fonts\calibri.ttf", r"C:\Windows\Fonts\calibrib.ttf"),
        (r"C:\Windows\Fonts\tahoma.ttf", r"C:\Windows\Fonts\tahomabd.ttf"),
    ]

    tried = []
    here = Path(__file__).parent.resolve()

    def exists(p: str) -> str | None:
        if os.path.exists(p):
            return p
        pp = here / p
        return str(pp) if pp.exists() else None

    for reg, bold in candidates:
        regp = exists(reg)
        if regp:
            boldp = exists(bold) or regp  # если bold нет — используем regular
            return regp, boldp
        tried.append(reg)
        tried.append(bold)

    raise FileNotFoundError(
        "Не найден подходящий TTF-шрифт с кириллицей.\n"
        "Положите рядом со скриптом, например, DejaVuSans.ttf и DejaVuSans-Bold.ttf\n"
        "ИЛИ используйте системный Arial/Segoe (обычно находятся в C:\\Windows\\Fonts).\n"
        "Проверенные пути:\n- " + "\n- ".join(tried)
    )


REG_PATH, BOLD_PATH = pick_cyrillic_font()
pdfmetrics.registerFont(TTFont("RU-Regular", REG_PATH))
pdfmetrics.registerFont(TTFont("RU-Bold", BOLD_PATH))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleRU", parent=styles["Title"], fontName="RU-Bold"))
styles.add(ParagraphStyle(name="H2RU", parent=styles["Heading2"], fontName="RU-Bold"))
styles.add(ParagraphStyle(name="NormalRU", parent=styles["Normal"], fontName="RU-Regular"))
styles.add(ParagraphStyle(name="SmallRU", parent=styles["Normal"], fontName="RU-Regular", fontSize=9))


def load_db(path="db.json"):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def idx_by(lst, key="id"):
    return {x[key]: x for x in lst}


# ========== NEW: Roster page before rounds ==========
def build_team_rosters(data, story):
    """Печатает сначала список команд и их 4 игроков (доски 1–4)."""
    teams = sorted(data.get("teams", []), key=lambda t: t.get("name", ""))
    # Подготовим индекс игроков по (team_id -> desk_number -> player)
    players_by_team_and_desk = {}
    for p in data.get("players", []):
        players_by_team_and_desk.setdefault(p["team_id"], {})[p.get("desk_number")] = p

    story.append(Paragraph("Составы команд", styles["H2RU"]))
    story.append(Spacer(1, 8))

    for team in teams:
        story.append(Paragraph(f"<b>{team.get('name','—')}</b>", styles["NormalRU"]))
        story.append(Spacer(1, 4))

        # Ровно 4 строки: доски 1..4
        table_data = [["Доска", "Игрок"]]
        for d in [1, 2, 3, 4]:
            p = players_by_team_and_desk.get(team["id"], {}).get(d)
            pname = p.get("full_name") if p else "—"
            table_data.append([d, pname])

        t = Table(table_data, hAlign="LEFT", colWidths=[36, 382])
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "RU-Bold"),
            ("FONTNAME", (0, 1), (-1, -1), "RU-Regular"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

    # Отделим составы от туров новой страницей
    story.append(PageBreak())
# ====================================================


def build_round_sheet(round_obj, data, story):
    players_by_id = idx_by(data["players"], "id")
    teams_by_id = idx_by(data["teams"], "id")

    # players_by_team_and_desk[team_id][desk_number] = player
    players_by_team_and_desk = {}
    for p in data["players"]:
        players_by_team_and_desk.setdefault(p["team_id"], {})[p["desk_number"]] = p

    # board results grouped by pairing
    boards_by_pairing = {}
    for br in data.get("board_results", []):
        boards_by_pairing.setdefault(br["pairing_id"], []).append(br)

    pairings = [p for p in data["pairings"] if p["round_id"] == round_obj["id"]]

    story.append(Paragraph(f"Тур {round_obj.get('round_number', '')}", styles["H2RU"]))
    story.append(Spacer(1, 6))

    for pairing in pairings:
        team_a = teams_by_id.get(pairing["team_a_id"])
        team_b = teams_by_id.get(pairing["team_b_id"]) if pairing.get("team_b_id") else None

        # ---- Требование: не показывать таблицу для BYE ----
        if not team_b:
            # пропускаем весь блок, если соперник отсутствует/bye
            continue

        team_a_name = team_a["name"] if team_a else "—"
        team_b_name = team_b["name"] if team_b else "—"
        score_str = f"{pairing.get('team_a_points', 0)} : {pairing.get('team_b_points', 0)}"

        # Заголовок пары (без цветов/заливки — просто текст)
        story.append(Paragraph(
            f"<b>{team_a_name}</b> vs <b>{team_b_name}</b> &nbsp;&nbsp; Счёт: <b>__ vs __</b>",
            styles["NormalRU"],
        ))
        story.append(Spacer(1, 4))

        # набор досок по двум командам
        desks = set()
        if team_a:
            desks.update(players_by_team_and_desk.get(team_a["id"], {}).keys())
        if team_b:
            desks.update(players_by_team_and_desk.get(team_b["id"], {}).keys())
        desks = sorted(desks)

        # ---- Добавлены 2 маленькие ячейки для нарушений ----
        header = ["Доска", "Белые (A)", "Чёрные (B)", "Результат", "1", "2", "Подпись игрока"]
        table_data = [header]

        brs = boards_by_pairing.get(pairing["id"], [])
        result_by_desk = {br["desk_number"]: br for br in brs}

        for d in desks:
            pA = players_by_team_and_desk.get(team_a["id"], {}).get(d) if team_a else None
            pB = players_by_team_and_desk.get(team_b["id"], {}).get(d) if team_b else None
            a_name = pA["full_name"] if pA else "—"
            b_name = pB["full_name"] if pB else "—"
            result = result_by_desk.get(d, {}).get("result", "")
            # две пустые маленькие ячейки для отметок нарушений
            table_data.append([d, a_name, b_name, result, "", "", ""])

        # Без цветов: убираем BACKGROUND в заголовке
        # Небольшие ширины для ⚠1 и ⚠2
        t = Table(
            table_data,
            hAlign="LEFT",
            colWidths=[36, 165, 165, 60, 16, 16, 72]
        )
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (3, 1), (3, -1), "CENTER"),
            ("ALIGN", (4, 1), (5, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 0), (-1, 0), "RU-Bold"),      # только жирный шрифт в заголовке
            ("FONTNAME", (0, 1), (-1, -1), "RU-Regular"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            # Без заливок/цветных хедеров — никаких BACKGROUND
        ]))
        story.append(t)
        story.append(Spacer(1, 12))

    story.append(PageBreak())


def main():
    data = load_db("db.json")

    doc = SimpleDocTemplate(
        "rounds_sheets.pdf",
        pagesize=A4,
        leftMargin=18, rightMargin=18, topMargin=20, bottomMargin=20,
        title="Листы туров",
        author="Chess Manager",
    )
    story = []
    story.append(Paragraph("Narxoz Chess", styles["TitleRU"]))
    story.append(Paragraph("", styles["SmallRU"]))
    story.append(Spacer(1, 12))

    # --- NEW: сначала выводим команды и их 4 игроков ---
    build_team_rosters(data, story)

    # --- Далее всё как было: туры и ведомости по парам ---
    rounds = sorted(data.get("rounds", []), key=lambda r: r.get("round_number", 0))
    for rnd in rounds:
        build_round_sheet(rnd, data, story)

    doc.build(story)
    print("✅ PDF сформирован: rounds_sheets.pdf")


if __name__ == "__main__":
    main()
