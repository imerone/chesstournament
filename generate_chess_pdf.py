import json
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet

# Load db.json
with open("db.json", "r", encoding="utf-8") as f:
    data = json.load(f)

doc = SimpleDocTemplate("chess_tournament.pdf", pagesize=A4)
elements = []
styles = getSampleStyleSheet()

elements.append(Paragraph("Chess Tournament Report", styles['Title']))
elements.append(Spacer(1, 12))

# Create a dict for quick player lookup
players_dict = {p["id"]: p for p in data["players"]}
teams_dict = {t["id"]: t for t in data["teams"]}

# Function to determine winner from result string like "1-0"
def get_winner(result, player_a, player_b):
    if result == "1-0":
        return player_a
    elif result == "0-1":
        return player_b
    elif result in ["0.5-0.5", "½-½"]:
        return "Draw"
    return "Unknown"

# Show rounds, pairings, and board results
for round in data["rounds"]:
    elements.append(Paragraph(f"Round {round['round_number']}", styles['Heading2']))
    elements.append(Spacer(1, 6))
    
    round_pairings = [p for p in data["pairings"] if p["round_id"] == round["id"]]
    
    for pairing in round_pairings:
        team_a = teams_dict[pairing["team_a_id"]]["name"]
        team_b = teams_dict[pairing["team_b_id"]]["name"] if pairing["team_b_id"] else "BYE"
        team_score = f"{pairing['team_a_points']} : {pairing['team_b_points']}"
        
        # Determine match winner
        if pairing["team_a_points"] > pairing["team_b_points"]:
            match_winner = team_a
        elif pairing["team_a_points"] < pairing["team_b_points"]:
            match_winner = team_b
        else:
            match_winner = "Draw"
        
        elements.append(Paragraph(f"{team_a} vs {team_b}  -  {team_score}  → Winner: {match_winner}", styles['Normal']))
        
        # Board results
        brs = [b for b in data["board_results"] if b["pairing_id"] == pairing["id"]]
        if brs:
            board_table = [["Desk", "Player A", "Player B", "Result", "Winner"]]
            for br in brs:
                player_a = players_dict[br["player_a_id"]]["full_name"]
                player_b = players_dict[br["player_b_id"]]["full_name"]
                winner = get_winner(br["result"], player_a, player_b)
                board_table.append([br["desk_number"], player_a, player_b, br["result"], winner])
            
            t = Table(board_table, hAlign='LEFT', colWidths=[50, 150, 150, 50, 100])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
                ('GRID', (0,0), (-1,-1), 1, colors.black),
                ('ALIGN',(0,0),(-1,-1),'CENTER')
            ]))
            elements.append(t)
        elements.append(Spacer(1, 12))

# Build PDF
doc.build(elements)
print("✅ PDF generated: chess_tournament.pdf")
