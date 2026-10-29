"""Bangun ulang js/data.js dari file Excel.
Pemakaian:  python build_data.py Kevin_Toba_2023.xlsx
Sheet yang dibaca: 'Data <Bulan>' (kolom: Date, Date, Hour, Pyranometer(W/m2), kWh/m2/days).
"""
import sys, json, pandas as pd
src = sys.argv[1] if len(sys.argv) > 1 else 'Kevin_Toba_2023.xlsx'
sheets = {4:'Data April',5:'Data May',6:'Data June',7:'Data July',8:'Data Aug',9:'Data Sep',10:'Data Oct',11:'Data Nov',12:'Data Dec'}
rows, year = [], None
for m, s in sheets.items():
    try: d = pd.read_excel(src, sheet_name=s, usecols=[0, 2, 3, 4])
    except ValueError: continue
    d.columns = ['dt', 'h', 'w', 'k']; d['dt'] = pd.to_datetime(d['dt'])
    year = int(d.dt.dt.year.iloc[0]); d['day'] = d.dt.dt.day
    g = d.groupby(['day', 'h']).agg(k=('k', 'sum'), w=('w', 'mean')).reset_index()
    rows += [[m, int(r.day), int(r.h), round(r.k, 6), round(r.w, 2)] for r in g.itertuples()]
out = {'sensor': 'Kevin_Toba', 'year': year, 'cols': ['month','day','hour','kwh','wm2'], 'rows': rows}
open('js/data.js', 'w').write('window.PYRANO_DATA=' + json.dumps(out, separators=(',', ':')) + ';')
print('data.js ditulis:', len(rows), 'baris')
