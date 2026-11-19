param($out,$qa)
$ErrorActionPreference='Stop'
$p=New-Object -ComObject PowerPoint.Application
$d=$p.Presentations.Add(0);$d.PageSetup.SlideWidth=960;$d.PageSetup.SlideHeight=540
function C($h){[Convert]::ToInt32($h.Substring(0,2),16)+256*[Convert]::ToInt32($h.Substring(2,2),16)+65536*[Convert]::ToInt32($h.Substring(4,2),16)}
function B($x,$y,$w,$h,$c){$q=$s.Shapes.AddShape(1,$x,$y,$w,$h);$q.Fill.ForeColor.RGB=(C $c);$q.Line.Visible=0}
function T($a,$x,$y,$w,$h,$z=18,$c='193B36',$b=0){$q=$s.Shapes.AddTextbox(1,$x,$y,$w,$h);$f=$q.TextFrame;$f.MarginLeft=0;$f.MarginRight=0;$f.MarginTop=0;$f.MarginBottom=0;$f.WordWrap=-1;$f.AutoSize=0;$r=$f.TextRange;$r.Text=[string]$a;$r.Font.Name='Calibri';$r.Font.Size=[string]$z;$r.Font.Bold=([string]$b);$r.Font.Color.RGB=(C $c);if($r.BoundHeight -gt ($h+2)){Write-Warning "Slide $($s.SlideIndex) overflow: $a"}}
function S($k,$ttl,$src,$dark=$false){$script:s=$d.Slides.Add($d.Slides.Count+1,12);$s.FollowMasterBackground=0;$s.Background.Fill.ForeColor.RGB=(C $(if($dark){'102E2B'}else{'F5F9F8'}));$script:ink=if($dark){'F2FAF8'}else{'102E2B'};$script:mut=if($dark){'A9D5C8'}else{'37665E'};T $k 42 31 850 22 13 $mut -1;T $ttl 42 62 876 84 34 $ink -1;T $src 42 514 830 18 11 $mut;T ('{0:00}/10' -f $s.SlideIndex) 871 512 56 20 12 $mut -1}
function K($x,$y,$w,$h,$head,$body){B $x $y $w $h 'E0EFEB';T $head ($x+16) ($y+13) ($w-32) 27 20 '104C41' -1;T $body ($x+16) ($y+48) ($w-32) ($h-52) 18}
function N($t){$s.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text=$t}
S '01   RESEARCH OVERVIEW  /  EQUITY RESEARCH' 'Apa yang berkaitan dengan ROA emiten batu bara?' 'Sumber: Hanadia (2025), sampul, abstrak hlm. v dan Bab I.' $true
T 'Pengaruh Pertumbuhan Penjualan dan Likuiditas terhadap Kinerja Keuangan dengan Ukuran Perusahaan sebagai Moderasi pada Perusahaan Pertambangan Batu Bara di Bursa Efek Indonesia Periode 2019–2023' 42 149 855 124 25 $ink
T 'Nurfatiha Hanadia  /  Universitas Riau  /  2025' 42 282 860 35 19 $mut -1
B 42 347 876 134 '1A4942';T 'Pada sampel 26 emiten, pertumbuhan penjualan dan likuiditas berkaitan positif dengan ROA dalam model dasar. Ukuran perusahaan memperkuat hubungan likuiditas dengan ROA, tetapi tidak terbukti memoderasi hubungan pertumbuhan penjualan dengan ROA.' 61 367 830 100 21 $ink
S '02   BACKGROUND & RESEARCH PROBLEM' 'ROA berfluktuasi sepanjang siklus batu bara' 'Sumber: Bab I §1.1, Gambar 1.2 (hlm. 4); Bab II §2.2–2.3.'
T 'Rata-rata ROA dalam Gambar 1.2' 42 146 460 26 19 '104C41' -1
$v=@(4.9,1,13.8,21.8,14.2);$l=@('4,9%','1,0%','13,8%','21,8%','14,2%');for($i=0;$i -lt 5;$i++){$x=55+88*$i;$h=8*$v[$i];B $x (392-$h) 57 $h '267A69';T $l[$i] $x (365-$h) 70 24 16;T (2019+$i) $x 403 75 24 16}
K 518 145 400 153 'Fenomena sektor' 'ROA merosot pada 2020, memuncak pada 2022, lalu turun pada 2023. Pandemi dan gejolak harga batu bara menjadi konteks, bukan variabel yang diuji.'
K 518 313 400 165 'Research gap' 'Temuan tentang penjualan dan likuiditas tidak konsisten. Studi ini menguji keduanya pada emiten batu bara serta menilai apakah skala aset mengubah hubungannya dengan ROA.'
S '03   RESEARCH OBJECTIVES & QUESTIONS' 'Empat hipotesis: dua hubungan, dua moderasi' 'Sumber: Bab I §1.2–1.3 (hlm. 11–12); Bab II §2.3 (hlm. 32–35).'
K 42 151 428 141 'H1  /  Pertumbuhan penjualan' 'Apakah kenaikan penjualan berkaitan dengan ROA? Hipotesis: positif dan signifikan.'
K 489 151 429 141 'H2  /  Likuiditas' 'Apakah kemampuan membayar kewajiban jangka pendek berkaitan dengan ROA? Hipotesis: positif dan signifikan.'
K 42 311 428 141 'H3  /  Penjualan × ukuran' 'Apakah hubungan penjualan–ROA berubah menurut skala aset? Hipotesis: ukuran memoderasi hubungan tersebut.'
K 489 311 429 141 'H4  /  Likuiditas × ukuran' 'Apakah hubungan likuiditas–ROA berubah menurut skala aset? Hipotesis: ukuran memoderasi hubungan tersebut.'
S '04   THEORETICAL FRAMEWORK' 'Dua teori menjelaskan mengapa rasio relevan' 'Sumber: Bab II §2.1–2.4 (hlm. 15–35); Bab V §5.6 (hlm. 90–99).'
K 42 145 428 155 'Agency Theory' 'Pemilik mendelegasikan pengelolaan kepada manajer. Pertumbuhan penjualan yang disertai efisiensi dapat mencerminkan pengelolaan yang selaras dengan kepentingan pemilik.'
K 489 145 429 155 'Signaling Theory' 'Laporan keuangan membantu mengurangi kesenjangan informasi. Current Ratio dapat memberi sinyal kemampuan menutup kewajiban jangka pendek.'
B 42 317 876 61 '174940';T 'Sales Growth & Current Ratio  →  ROA   |   Ukuran aset memoderasi kedua hubungan' 59 335 846 34 20 'FFFFFF' -1
T 'Studi pembanding: Ray dkk. (2024) menemukan hubungan SG positif, sedangkan Putri & Andriansyah (2022) tidak menemukan signifikansi. Tang (2022) mendukung moderasi likuiditas.' 42 400 876 81 18
S '05   RESEARCH METHODOLOGY' 'Dari 34 emiten, 26 memenuhi kriteria sampel' 'Sumber: Bab III §3.2–3.6, Tabel 3.1–3.2; Bab IV Tabel 4.1.'
T 'Kuantitatif observasional  /  Laporan tahunan dan laporan keuangan BEI  /  2019–2023' 42 145 876 29 18 '104C41' -1
K 42 185 309 264 'Purposive sampling' "34 emiten dalam populasi.`n6 dikeluarkan: laporan tidak lengkap.`n2 dikeluarkan: pindah sektor.`n26 emiten × 5 tahun = 130 observasi emiten–tahun sebelum penyaringan outlier."
K 371 185 547 264 'Definisi operasional' "ROA (Y) = laba bersih ÷ total aset.`nSG (X1) = (penjualan tahun ini − penjualan tahun lalu) ÷ penjualan tahun lalu.`nCR (X2) = aset lancar ÷ utang lancar.`nUkuran (M) = ln(total aset), bukan kapitalisasi pasar."
T 'Analisis: regresi linear berganda dan Moderated Regression Analysis (MRA) di SPSS 27.' 42 467 875 31 18
S '06   RESEARCH PROCESS & ANALYTICAL MODEL' 'Moderasi diuji lewat koefisien interaksi' 'Sumber: Bab III §3.4–3.6; Bab V Tabel 5.2–5.14 (hlm. 63, 79–89); Lampiran 2–4.'
K 42 142 276 147 '01  Hitung rasio' 'Tabulasi laporan keuangan menjadi ROA, SG, CR, dan ln(total aset).'
K 333 142 276 147 '02  Saring data' '130 → 96 observasi setelah dua putaran penghapusan outlier. Uji normalitas residual: p = 0,105.'
K 624 142 294 147 '03  Uji & estimasi' 'VIF, Glejser, Durbin–Watson. DW 1,627 → 1,911 setelah Cochrane–Orcutt.'
B 42 306 876 105 '174940';T "Dasar: ROA = α + b₁SG + b₂CR + ε`nMRA: ROA = α + b₁SG + b₂CR + b₃(SG × M) + b₄(CR × M) + ε" 60 325 840 74 22 'FFFFFF'
T 'Uji t menilai tiap koefisien (α = 5%); uji F menilai model secara keseluruhan. Koefisien interaksi menunjukkan perubahan kemiringan hubungan saat ukuran berubah.' 42 429 875 63 18
N 'Tabel model akhir menamai variabel asli, sedangkan tabel Cochrane–Orcutt menamai variabel LAG. Penerapan transformasi pada estimasi akhir tidak jelas dari tabel. MRA yang dilaporkan tidak memasukkan efek utama ukuran perusahaan. Uji ulang idealnya memasukkan efek utama dan menangani pengelompokan observasi per emiten.'
S '07   MAIN FINDINGS & RESULTS' 'H1, H2, dan H4 didukung; H3 tidak' 'Sumber: Bab V Tabel 5.9–5.14 (hlm. 84–89); Bab VI §6.1.'
$rows=@('Hipotesis|Prediktor|B|t|p|Keputusan','H1 · Dasar|Sales Growth|+0,066|3,216|0,002|Didukung','H2 · Dasar|Current Ratio|+0,047|3,737|<0,001|Didukung','H3 · MRA|SG × Ukuran|−0,006|−0,493|0,623|Tidak didukung','H4 · MRA|CR × Ukuran|+0,008|2,427|0,017|Didukung')
$q=$s.Shapes.AddTable(5,6,42,145,876,218);$tb=$q.Table;$ws=@(147,218,103,100,110,198);for($j=1;$j -le 6;$j++){$tb.Columns.Item($j).Width=$ws[$j-1]};for($i=1;$i -le 5;$i++){$r=$rows[$i-1].Split('|');for($j=1;$j -le 6;$j++){$c=$tb.Cell($i,$j).Shape;$c.Fill.ForeColor.RGB=(C $(if($i -eq 1){'174940'}elseif($i % 2 -eq 0){'E0EFEB'}else{'F5F9F8'}));$c.TextFrame.VerticalAnchor=3;$c.TextFrame.MarginLeft=12;$tr=$c.TextFrame.TextRange;$tr.Text=$r[$j-1];$tr.Font.Name='Calibri';$tr.Font.Size="17";$tr.Font.Color.RGB=(C $(if($i -eq 1){'FFFFFF'}else{'203A38'}));if($i -eq 1){$tr.Font.Bold="-1"}}}
T 'Adjusted R²: 23,5% → 26,9%  |  F: 15,593 (dasar) dan 9,740 (MRA); keduanya p < 0,001.' 42 385 876 30 18 '104C41' -1
T 'Kenaikan adjusted R² bukan bukti bahwa kedua interaksi signifikan. Keputusan mengikuti p-value tabel SPSS, bukan narasi t-tabel yang tidak konsisten.' 42 426 876 62 18
N 'N = 96 pada kedua model. R²: 0,251 dan 0,300. Pada MRA, koefisien SG 0,242 (p = 0,490) dan CR −0,200 (p = 0,054) berlaku saat ln(total aset) = 0, di luar rentang sampel (26,7607–32,7578). Tanda negatif CR pada MRA tidak membatalkan hasil positif model dasar. Tabel 5.14 menunjukkan CR × ukuran signifikan, bukan SG × ukuran seperti salah disebut pada hlm. 89.'
S '08   INTERPRETATION & IMPLICATIONS' 'Baca likuiditas bersama skala aset dan arus kas' 'Sumber: Bab V §5.6 (hlm. 90–99); Bab VI §6.3 (hlm. 102–103).'
K 42 146 428 234 'Interpretasi peneliti' 'SG positif sejalan dengan penjelasan teori agensi; CR positif konsisten dengan teori sinyal. Peneliti menduga perusahaan besar lebih mampu menyalurkan dana lancar ke operasi atau ekspansi. Mekanisme itu tidak diuji langsung.'
K 489 146 429 234 'Penerapan bagi investor' 'Bandingkan tren SG, CR, dan ROA antar emiten berskala sebanding. Cek apakah penjualan menjadi laba dan kas: lihat margin, arus kas operasi, kualitas aset lancar, dan jatuh tempo utang. Uji skenario harga batu bara dan regulasi ekspor.'
B 42 402 876 72 '174940';T 'ROA mengukur profitabilitas aset, bukan return saham. Hasil ini bukan bukti sebab-akibat atau sinyal beli/jual.' 60 417 841 54 20 'FFFFFF' -1
N 'Hasil SG berbeda dari Putri & Andriansyah (2022) dan Anggara Prasetya & Susilowati (2024); hasil CR berbeda dari Mursidah dkk. (2023). H3 sejalan dengan Arifin & Arif (2024) dan Utami dkk. (2023), berbeda dari Trisakti dkk. (2025) dan Alfindo Hm (2022). H4 sejalan dengan Tang (2022), berbeda dari Ginting dkk. Interaksi positif tidak membuktikan bahwa hubungan signifikan di tiap kelompok ukuran; uji simple slopes tidak ditampilkan.'
S '09   CONCLUSIONS, LIMITATIONS & RECOMMENDATIONS' 'Bukti berguna, tetapi terbatas pada sampel' 'Sumber: Bab VI §6.1–6.3 (hlm. 100–104); Bab V Tabel 5.2 dan 5.12–5.14.'
K 42 145 276 278 'Kontribusi' 'Bukti spesifik emiten batu bara BEI: SG dan CR berkaitan positif dengan ROA pada model dasar. Skala aset membedakan hubungan CR–ROA, tetapi tidak terbukti membedakan hubungan SG–ROA.'
K 333 145 276 278 'Keterbatasan' 'Satu sektor dan lima tahun, termasuk pandemi dan gejolak harga. Leverage, biaya dan GCG belum dimodelkan. Penghapusan 34 observasi dapat memengaruhi hasil.'
K 624 145 294 278 'Saran peneliti' 'Perpanjang periode, bandingkan dengan sektor lain, dan tambahkan struktur modal, efisiensi biaya, serta GCG. Emiten disarankan mengendalikan biaya, likuiditas, dan risiko eksternal.'
T 'Catatan analitis: uji ulang dengan efek utama ukuran dan metode panel; bandingkan hasil dengan dan tanpa outlier.' 42 441 875 56 18
S '10   KEY TAKEAWAYS' 'Gunakan rasio untuk menguji kualitas laba' 'Sumber: Bab V §5.4–5.6 dan Bab VI §6.1–6.3.' $true
$a=@('Studi mengukur ROA emiten batu bara BEI, bukan return saham.','Pertumbuhan penjualan berkaitan positif dengan ROA pada model dasar.','Likuiditas juga berkaitan positif dengan ROA pada model dasar.','Ukuran aset memperkuat hubungan CR–ROA; moderasi SG–ROA tidak terbukti.','Lengkapi analisis rasio dengan margin, arus kas, dan siklus komoditas.')
for($i=0;$i -lt 5;$i++){$y=147+$i*50;B 42 $y 35 32 '267A69';T ($i+1) 53 ($y+3) 23 24 18 'FFFFFF' -1;T $a[$i] 94 ($y+2) 824 37 20 $ink}
B 42 409 876 76 '1A4942';T 'Intinya: pada sampel ini, skala aset membantu menjelaskan kapan likuiditas lebih erat berkaitan dengan profitabilitas.' 61 423 830 56 21 $ink -1
$d.SaveAs($out,24);$d.Export($qa,'PNG',960,540);$d.Close()
