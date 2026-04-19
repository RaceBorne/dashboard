# UK Luxury Retreat Hotels — Fleet Sale Prospects

A curated list of UK country house hotels, members' clubs, and luxury retreats at Soho Farmhouse tier. The play is to land **fleet sales of 4–12 Evari bikes per property** as guest amenity, replacing or upgrading existing fleets (which are usually entry-level Pashleys, Frog hire bikes, or budget e-bikes that don't match the property's positioning).

Properties marked **"Has bikes"** are upgrade candidates. Properties marked **"Unknown"** or **"None"** are net-new fleet pitches.

---

## Tier 1 — Soho Farmhouse peer group (members' club / mega-estate scale)

| Property | Location | Group / Owner | Bikes today |
|---|---|---|---|
| Soho Farmhouse | Great Tew, Oxfordshire | Soho House | Has bikes (entry-level cruisers — upgrade target) |
| Babington House | Frome, Somerset | Soho House | Some — basic borrow fleet |
| Estelle Manor | Witney, Oxfordshire | Ennismore | Free-to-use bikes confirmed |
| The Newt in Somerset | Bruton, Somerset | Karen Roos / Hadspen | Has bikes — buggies and bikes between properties |
| Heckfield Place | Heckfield, Hampshire | Privately owned | Has guided bike tours + estate cycling |
| Beaverbrook | Leatherhead, Surrey | Privately owned | Unknown — likely fleet candidate |
| The Wild Rabbit (+ Daylesford) | Kingham, Cotswolds | Bamford family | Some — wellness / Daylesford-branded |
| Birch Selsdon / Birch Cheshunt | Surrey / Hertfordshire | Birch | Yes — community cycling brand fit |
| Coworth Park | Ascot, Berkshire | Dorchester Collection | Unknown |
| Cliveden House | Taplow, Berkshire | Iconic Luxury Hotels | Unknown |

---

## Tier 2 — Pride of Britain Hotels (50-strong invite-only group)

Pride of Britain caps membership at 50. These are the country-set worth pitching. Worth approaching the PoB head office (Bracknell) for a single fleet supplier framework rather than picking off one by one.

| Property | Location | Bikes today |
|---|---|---|
| Lucknam Park Hotel & Spa | Wiltshire | None confirmed — 500-acre estate, perfect fit |
| Whatley Manor | Wiltshire | Has e-bike fleet (verify brand) |
| Bailiffscourt Hotel & Spa | West Sussex | Has e-bikes — 30 acres parkland |
| The Atlantic | Jersey | Has premium e-bikes (model unknown) |
| Glenapp Castle | South Ayrshire | Unknown — coastal estate |
| Buckland Tout-Saints | Devon | Unknown |
| Boringdon Hall | Plymouth | Unknown |
| Tylney Hall | Hampshire | Unknown |
| Lime Wood | New Forest | Some — New Forest cycling country |
| Forest Side | Grasmere, Lake District | Unknown — Lakes is bike heavy |
| Gravetye Manor | West Sussex | Unknown |
| The Lygon Arms | Broadway, Cotswolds | Unknown |
| Rockliffe Hall | Darlington | Unknown — 375 acres |

---

## Tier 3 — The Pig Hotels (independent group, ~10 properties)

The Pig is its own group. Cotswold/coastal/forest concept. Already has "bikes to borrow" at most properties — fleet refresh target, plus an opening for a single e-bike upgrade.

| Property | Location |
|---|---|
| THE PIG, Brockenhurst | Hampshire (New Forest) |
| THE PIG near Bath | Somerset |
| THE PIG on the Beach | Studland, Dorset |
| THE PIG at Combe | Honiton, East Devon |
| THE PIG at Bridge Place | Canterbury, Kent |
| THE PIG on the Downs | South Downs |
| THE PIG at Harlyn Bay | Cornwall |
| THE PIG in the Wall | Southampton |
| THE PIG in the Cotswolds | Barnsley village |
| THE PIG-on the farm | Stratford-upon-Avon (opened Dec 2024) |

Single corporate buyer (Robin Hutson / Home Grown Hotels). One conversation, ten POs.

---

## Tier 4 — Wilderness, Highlands, and Lake District retreats

Less Soho-set, but premium and on-brand for "go off, explore, then come back to a nice bath".

| Property | Location | Notes |
|---|---|---|
| Wilderness Reserve | Suffolk | 5,000-acre estate, Belmond-tier |
| The Fife Arms | Braemar, Cairngorms | Hauser & Wirth-owned, art-led |
| Killiehuntly Farmhouse | Cairngorms | Wildland (Anders Povlsen) — already cycling-heavy guest profile |
| Newhall Mains | Black Isle, Scotland | Has VOLT Alpine eMTB fleet — direct competitor presence |
| Inverlochy Castle | Fort William | Unknown |
| Ardanaiseig | Loch Awe | Unknown |
| Another Place | Ullswater, Lake District | Has bikes — adventure-focused |
| Park House Hotel | Sandy Lane, Bedford | Unknown |

---

## Tier 5 — Wellness retreats (yoga / detox / longevity)

Different positioning but identical guest profile. Bikes increasingly part of "movement" programming.

| Property | Location |
|---|---|
| Grove of Narberth | Pembrokeshire (has Pulse hybrid e-bikes) |
| Champneys Tring | Hertfordshire |
| Forest Mere | Liphook, Hampshire |
| The Lifehouse Spa | Frinton-on-Sea |
| Whatley Manor (also Tier 2) | Wiltshire |

---

## How to reach all of these efficiently

Three routes ranked by speed-to-meeting:

**1. Pride of Britain Hotels head office (single conversation, 50 properties).** Pitch a "preferred fleet supplier" status. Their members listen to head office because PoB-led sponsor deals come pre-vetted. Contact via pobhotels.com / Bracknell HQ.

**2. Home Grown Hotels (Robin Hutson) for The Pig group (single conversation, 10 properties).** One PO, ten venues. He has form for design-led suppliers and would respond to a UK-made premium pitch.

**3. Direct outreach to the Soho House country GMs.** Soho Farmhouse and Babington each have a head of guest experience who controls the bike line. Soho House is publicly trying to hit sustainability targets — premium e-bike replacing minicabs to the nearest village is an easy win to write up internally.

---

## Scraping the data into the dashboard

Three sources to wire into the Prospects page:

- **Pride of Britain member directory** — pobhotels.com/member-hotels (paginated HTML, scrape with Playwright, ~50 properties with named GM contacts).
- **Sawday's Special Places to Stay** — sawdays.co.uk filter by "Hotel" + region (≈800 properties, drill to the £400+ ADR ones).
- **Mr & Mrs Smith** — mrandmrssmith.com/luxury-hotels filtered to UK + 4 keys upward (≈300 properties).

For each scraped record, capture: property name, group/owner, location, bedroom count (proxy for fleet size), and whether the website mentions bikes/cycling. Properties that mention bikes go into the "upgrade pitch" lane; properties that don't go into the "first fleet" lane.

---

## What "good" looks like as a target

Soho Farmhouse alone has ~40 cabins and a 100-acre estate — a serious fleet would be 12–20 bikes. At Evari premium pricing, that's a £40–80k single PO. Across the ~80 tier-1/2 properties on this list, the addressable revenue from one round of fleet refresh is in the £2–4m range.

Pride of Britain alone, if landed as a preferred supplier deal at one PO of 6 bikes per property, is £1.2m+ at premium ASP.
