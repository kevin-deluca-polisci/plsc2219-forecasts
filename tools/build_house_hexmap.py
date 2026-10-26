"""Build data/house_hexmap_2026.json, the House map on class-model.html.

Source: The Downballot's hex cartogram of the 2026 congressional districts
(https://the-db.co/maps), as packaged in Shiro Kuriwaki's fourthirtyfive R
package (https://github.com/kuriwaki/fourthirtyfive), data/shp_hex_2027.rda
(Congress 120, the districts used in the 2026 elections). Used with the
maintainers' encouragement; the page credits The Downballot and the package.

Converts each district's polygons (Web Mercator) to an SVG path scaled to a
1,000-unit-wide box, dissolves districts into state outlines, and writes one
compact JSON file. No R needed.

    pip install rdata shapely numpy
    git clone --depth 1 https://github.com/kuriwaki/fourthirtyfive
    python tools/build_house_hexmap.py fourthirtyfive/data/shp_hex_2027.rda data/house_hexmap_2026.json

District keys match races_2026.csv (HOU_AK_01_2026 ...).
"""
import rdata, json, numpy as np, warnings, sys
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
warnings.filterwarnings('ignore')
src, out = sys.argv[1], sys.argv[2]
df = rdata.conversion.convert(rdata.parser.parse_file(src), default_encoding='utf8')['shp_hex_2027']
def to_mp(g):
    polys=[]
    for poly in g:
        rings=[np.asarray(r,dtype=float) for r in poly]
        polys.append(Polygon(rings[0], rings[1:]))
    return MultiPolygon(polys) if len(polys)>1 else polys[0]
geoms={}
for cd,g in zip(df['cd'], df['geometry']):
    geoms[cd]=to_mp(g)
allg=unary_union(list(geoms.values())); minx,miny,maxx,maxy=allg.bounds
W=1000.0; s=W/(maxx-minx); H=(maxy-miny)*s; pad=4
def P(x,y): return (round((x-minx)*s+pad,1), round((maxy-y)*s+pad,1))
eps=0.5/s; tol=0.25/s
def path(g):
    g=g.simplify(tol)
    parts=[]
    for poly in (g.geoms if hasattr(g,'geoms') else [g]):
        for ring in [poly.exterior,*poly.interiors]:
            pts=[P(x,y) for x,y in list(ring.coords)[:-1]]
            parts.append('M'+'L'.join(f'{x:g} {y:g}' for x,y in pts)+'Z')
    return ''.join(parts)
dist={f"HOU_{cd[:2]}_{cd[3:]}_2026": path(g) for cd,g in geoms.items()}
bystate={}
for cd,g in geoms.items(): bystate.setdefault(cd[:2],[]).append(g)
states={}; labels={}
for st,gs in bystate.items():
    u=unary_union(gs).buffer(eps, join_style=2).buffer(-eps, join_style=2).simplify(tol)  # close hairline gaps; square joins keep hex corners
    states[st]=path(u)
    c=u.representative_point(); labels[st]=list(P(c.x,c.y))
json.dump({"source":"Hex cartogram of the 2026 congressional districts by The Downballot (the-db.co/maps), via the fourthirtyfive R package (Kuriwaki et al.), shp_hex_2027.",
           "viewBox":[0,0,round(W+2*pad,1),round(H+2*pad,1)],"districts":dist,"states":states,"labels":labels},
          open(out,'w'),separators=(',',':'))
print(len(dist), len(states), round(H), 'bytes', len(open(out).read()))
