# Rent & Play: analytics demonstration guide

Makikita ang analytics sa **sidebar → Reports → Business analytics**. Ang report ay nagkukuwenta mula sa naka-save na records; hindi ito naglalagay ng sample transactions sa Firebase.

## Bago mag-demo

1. I-restart ang backend at web app pagkatapos ng update, at mag-sign in.
2. Pumili ng period na may actual rental activity. Available ang Last 7/30/90/365 days at Custom dates, hanggang 366 days.
3. I-check ang **Data coverage & measurement notes**. Ang `—` ay kulang ang valid data para sa average o percentage; hindi ito katumbas ng zero.
4. Para may maipakitang comparison, gumamit ng hiwalay na test environment na may malinaw na labeled test records: maraming equipment, zero-rental item, repeat customer, on-time at late return, maintenance, at confirmed terminal requests. Huwag magpanggap na tunay na revenue ang test transactions.

## Suggested demonstration flow

1. **Rental performance:** ipakita ang total fees, rentals, utilization at average fee. Palitan ang Trend grouping sa Daily, Weekly at Monthly; buksan ang **View exact trend values**.
2. **Equipment insights:** ituro ang Most rented, Least rented at Revenue per equipment. Ipakita na kasama sa least rented ang zero-rental items. Gamitin ang Sort by at Next sa full performance table; tig-5 rows bawat page.
3. **Filters:** pumili ng category o isang equipment para makita ang parehong metrics para lamang sa selection. Ang pagbabago ng category ay nagre-reset ng equipment selection.
4. **Service & operations:** ipakita ang overdue, on-time, average duration, repeat customers, maintenance frequency at downtime.
5. **Terminal verification time:** ipakita ang average, median, P95 at per-terminal breakdown kung may valid confirmed requests.
6. **Explain and export:** buksan ang **How these 14 analytics are calculated**, pagkatapos pindutin ang **Export analytics CSV**. Kasama ang buong filtered results, hindi lamang ang limang nasa kasalukuyang page.

## Ang 14 analytics at puwedeng ipaliwanag

| Analytics | Sukatan at gamit |
| --- | --- |
| Revenue trend | Recorded rental fees ng ACTIVE/COMPLETED rentals ayon sa confirmation date. Daily, calendar-week at calendar-month view para makita ang pagbabago ng charges. Hindi kasama ang deposits, pending at cancelled requests. |
| Rentals trend | Bilang ng confirmed rentals sa bawat period; hiwalay sa halaga ng fees para makita ang demand. |
| Equipment utilization | Rented hours ÷ observed calendar hours × 100. Nagsisimula sa item creation o period start, alinman ang mas huli; hindi kasama ang recorded archived intervals. Hindi nadodoble ang overlapping rentals. |
| Most rented equipment | Top five ayon sa confirmed rental count. Nakakatulong sa pag-prioritize ng stock. |
| Least rented equipment | Pinakamababang rental count ng currently active items na naidagdag na bago ang period cutoff, kasama ang zero-rental items. Posibleng pag-aralan ang promotion, placement o pricing; hindi ito automatic na rekomendasyon na alisin ang item. |
| Revenue per equipment | Recorded fees kada item. Maaaring magkaiba ang pinakamaraming rentals at pinakamalaking fees. |
| Revenue per category | Recorded fees ayon sa kasalukuyang category ng equipment. Hindi nire-reconstruct ang dating categories. |
| Overdue rate | Late o still-overdue rentals ÷ valid rentals na due sa period hanggang cutoff × 100. Recorded due time ang basehan, walang grace allowance. |
| On-time return rate | Returns na on/before due time ÷ completed returns na may valid dates sa period × 100. |
| Average rental duration | Average ng return confirmation minus rental confirmation, para sa completed returns sa period. Full duration ang kinukuha, hindi lang ang bahaging pasok sa filter. |
| Repeat customer rate | Customers na may 2+ confirmed rentals ÷ customers na may kahit isang confirmed rental sa period × 100. Period-specific ito, hindi lifetime retention. |
| Maintenance frequency | Bilang ng maintenance records na nagsimula sa period kada item. Kasama ang inspections at preventive care; hindi lahat ay pagkasira. |
| Maintenance downtime | Merged maintenance hours sa loob ng period, kasama ang carry-over at ongoing work. Fleet total ay item-hours: dalawang item na tig-isang oras unavailable = dalawang item-hours. |
| Terminal verification time | Confirmation timestamp minus request timestamp para sa valid CONFIRMED terminal requests. Kasama ang queue at operator wait; hindi ito purong ESP32 processing latency. |

## Karaniwang tanong ng panel

**“Bakit hindi 100% kapag pinagsama ang overdue at on-time rates?”**

Magkaiba ang sample: due dates ang filter ng overdue rate; return dates naman sa on-time rate. Halimbawa, puwedeng due noong nakaraang buwan pero naibalik ngayong buwan.

**“Income ba talaga ang Revenue?”**

Recorded rental charges ang ipinapakita, hindi verified cash collections, net profit o payment reconciliation. Hindi kinukuwenta ang refundable deposits bilang revenue.

**“Bakit mababa ang utilization?”**

Calendar hours ang denominator, kasama ang gabi at maintenance, hindi business opening hours. Kapag walang creation date, period start ang fallback at ipinapakita ito sa measurement notes. Kapag kulang ang archive history, hindi isinasama ang item sa utilization.

**“Ano ang median at P95?”**

Median ang gitnang verification time. Ang P95 ay interpolated 95th percentile ng measured times, na tumutulong makita ang mas mababagal na confirmations. Makikita rin ang bilang ng samples para hindi ma-overinterpret ang kakaunting records.

**“Bakit may dash sa terminal verification?”**

Kailangan ng confirmed request, terminal ID at valid request/confirmation timestamps. Puwedeng gamitin ang linked rental/return confirmation kapag malinaw ang transaction type. Kung wala pa, kulang pa ang data; hindi gagawa ng kunwaring zero-second result ang report.

**“Historical lahat ng nakikita?”**

Ang time-based metrics ay hanggang period end o current time, alinman ang mas maaga. Ang **Equipment right now** at **overdue now** ay current snapshots, kahit historical ang napiling period. Philippine time ang calendar dates, Monday–Sunday ang weeks, at partial ang kasalukuyang araw.

## Saklaw ng verification

May automated tests para sa calculations, filters, overlapping intervals, missing dates at CSV export. Browser layout at interactions ay na-check gamit ang synthetic local records na hindi ini-save sa Firebase. Bago ang actual demonstration, i-check pa rin ang inyong live records at physical ESP32 workflow; hindi pinatutunayan ng analytics update na connected na ang device confirmation writes.
