/**
 * Wortketten: Jede Zeile ist eine Kette, Stufen durch Leerzeichen getrennt.
 * Regeln (geprüft von tests/chains.test.ts und `npm run check-chains`):
 * - 3 bis 5 Stufen, jede Stufe beginnt mit der vorigen.
 * - Kein Wort kommt doppelt vor, kein Startwort doppelt.
 * - Nur echte, gängige deutsche Wörter.
 */
const RAW = `
Haus Haustür Haustürschlüssel
Schiff Schifffahrt Schifffahrtsgesellschaft
Hand Handschuh Handschuhfach
Auto Autobahn Autobahnausfahrt
Bahn Bahnhof Bahnhofshalle
Fuß Fußball Fußballweltmeister Fußballweltmeisterschaft
Sonne Sonnen Sonnenblume Sonnenblumenöl
Wasser Wasserstand Wasserstandsmeldung
Brief Briefmarke Briefmarkensammlung
Kind Kinder Kindergarten Kindergartenplatz
Tisch Tischtennis Tischtennisplatte
Feuer Feuerwehr Feuerwehrauto
Schnee Schneeball Schneeballschlacht
Regen Regenschirm Regenschirmständer
Wind Windmühle Windmühlenflügel
Zahn Zahnrad Zahnradbahn
Kopf Kopfhörer Kopfhörerkabel
Arbeit Arbeitszeit Arbeitszeitmodell
Geburt Geburtstag Geburtstagsfeier
Welt Weltraum Weltraumteleskop
Buch Buchhaltung Buchhaltungssoftware
Tag Tagebuch Tagebucheintrag
Nacht Nachttisch Nachttischlampe
Kaffee Kaffeesatz Kaffeesatzleserei
Tee Teelicht Teelichthalter
Milch Milchglas Milchglasscheibe
Butter Butterbrot Butterbrotpapier
Apfel Apfelsaft Apfelsaftschorle
Flug Flugzeug Flugzeugträger
Post Postkarte Postkartenständer
Stadt Stadtteil Stadtteilfest
Land Landwirt Landwirtschaft Landwirtschaftsminister Landwirtschaftsministerium
Berg Bergbau Bergbaumuseum
Wald Waldbrand Waldbrandgefahr
Meer Meeresspiegel Meeresspiegelanstieg
See Seemann Seemannsgarn
Spiel Spielzeug Spielzeugauto
Blume Blumen Blumentopf Blumentopferde
Wein Weinberg Weinbergschnecke
Eis Eisberg Eisbergsalat
Computer Computerspiel Computerspieler
Uhr Uhrmacher Uhrmachermeister
Zeit Zeitung Zeitungsartikel
Kleid Kleider Kleiderschrank
Dach Dachgeschoss Dachgeschosswohnung
Bad Badezimmer Badezimmerspiegel
Wohnung Wohnungsbau Wohnungsbaugesellschaft
Jahr Jahrhundert Jahrhundertwende
Winter Wintersport Wintersportort
Koffer Kofferraum Kofferraumdeckel
Fahrrad Fahrradhelm Fahrradhelmpflicht
Motor Motorrad Motorradfahrer
Gold Goldfisch Goldfischglas
Tasche Taschen Taschenbuch Taschenbuchausgabe
Hose Hosen Hosentasche
Schuh Schuhmacher Schuhmachermeister
Auge Augenbraue Augenbrauenstift
Finger Fingerspitze Fingerspitzengefühl
Nagel Nagellack Nagellackentferner
Werk Werkzeug Werkzeugkasten
Bild Bilder Bilderbuch Bilderbuchwetter
Feier Feierabend Feierabendverkehr
Straße Straßen Straßenbahn Straßenbahnhaltestelle
Rat Rathaus Rathausplatz
Hoch Hochzeit Hochzeitstag
Wirt Wirtschaft Wirtschaftsminister Wirtschaftsministerium
Park Parkplatz Parkplatzsuche
Sitz Sitzplatz Sitzplatzreservierung
Eisen Eisenbahn Eisenbahnbrücke
Seil Seilbahn Seilbahnstation
Schlag Schlagzeug Schlagzeuger
Brett Brettspiel Brettspielabend
Karte Kartei Karteikarte
Schau Schaufenster Schaufensterpuppe
Puppe Puppen Puppenspiel Puppenspieler
Video Videospiel Videospielkonsole
Kredit Kreditkarte Kreditkartennummer
Sommer Sommerzeit Sommerzeitumstellung
Raum Raumfahrt Raumfahrtzentrum
Heim Heimat Heimatmuseum
Himmel Himmelfahrt Himmelfahrtstag
Kraft Kraftstoff Kraftstoffverbrauch
Netz Netzwerk Netzwerkkabel
Fach Fachwerk Fachwerkhaus
All Alltag Alltagssprache
Weihnacht Weihnachtsbaum Weihnachtsbaumschmuck
Floh Flohmarkt Flohmarktstand
Feder Federball Federballschläger
Bau Baustelle Baustellenschild
Kauf Kaufmann Kaufmannsladen
Staub Staubsauger Staubsaugerbeutel
Kugel Kugelschreiber Kugelschreibermine
Blei Bleistift Bleistiftspitzer
Löwe Löwenzahn Löwenzahnhonig
Maul Maulwurf Maulwurfshügel
Schild Schildkröte Schildkrötenpanzer
Hai Haifisch Haifischflosse
Tinte Tintenfisch Tintenfischring
Draht Drahtseil Drahtseilakt
Drache Drachen Drachenboot Drachenbootrennen
Segel Segelflug Segelflugzeug
Ruder Ruderboot Ruderbootverleih
Sand Sandkasten Sandkastenfreund
Stein Steinzeit Steinzeitmensch
Boden Bodensee Bodenseeufer
Treppe Treppen Treppenhaus
Tor Torwart Torwarthandschuh
Kürbis Kürbiskern Kürbiskernöl
Bäcker Bäckerei Bäckereifachverkäuferin
Gast Gastgeber Gastgeberland
Bürger Bürgermeister Bürgermeisterwahl
Bund Bundestag Bundestagswahl Bundestagswahlkampf
Staat Staatsanwalt Staatsanwaltschaft
Recht Rechtsanwalt Rechtsanwaltskanzlei
Freund Freundschaft Freundschaftsspiel
Mann Mannschaft Mannschaftskapitän
Nachbar Nachbarschaft Nachbarschaftshilfe
Wissen Wissenschaft Wissenschaftler
Meister Meisterschaft Meisterschaftstitel
Fleisch Fleischer Fleischerei
Fisch Fischer Fischerei Fischereihafen
Druck Drucker Druckerei
Schloss Schlosser Schlosserei
Last Lastwagen Lastwagenfahrer
Ober Oberschenkel Oberschenkelknochen
Arm Armband Armbanduhr
Not Notarzt Notarztwagen
Schlaf Schlafzimmer Schlafzimmerschrank
Tier Tierschutz Tierschutzverein
Kunst Kunststoff Kunststoffflasche
Kreuz Kreuzfahrt Kreuzfahrtschiff
Zeichen Zeichentrick Zeichentrickfilm
Holz Holzkohle Holzkohlegrill
Laut Lautstärke Lautstärkeregler
Fest Festplatte Festplattenspeicher
Schach Schachbrett Schachbrettmuster
Sieg Sieger Siegerehrung
Vater Vaterschaft Vaterschaftsurlaub
Pfeffer Pfefferminz Pfefferminztee
Flut Flutlicht Flutlichtanlage
Gemeinde Gemeinderat Gemeinderatssitzung
Einkauf Einkaufswagen Einkaufswagenchip
Lehre Lehrer Lehrerzimmer
Leser Leserbrief Leserbriefseite
Bord Bordstein Bordsteinkante
Grund Grundstück Grundstücksgrenze
Leben Lebensmittel Lebensmittelgeschäft
Mittel Mittelmeer Mittelmeerküste
Nord Nordsee Nordseeküste
Ost Ostsee Ostseebad
Süd Südsee Südseeinsel
Rose Rosen Rosenmontag Rosenmontagszug
Stamm Stammtisch Stammtischrunde
Glück Glückwunsch Glückwunschkarte
Natur Naturschutz Naturschutzgebiet
Umwelt Umweltschutz Umweltschutzorganisation
Daten Datenschutz Datenschutzerklärung
Lärm Lärmschutz Lärmschutzwand
Dampf Dampfschiff Dampfschifffahrt
Donner Donnerstag Donnerstagabend
Silber Silbermedaille Silbermedaillengewinner
Klavier Klavierspiel Klavierspieler
Lied Lieder Liederbuch
Geist Geister Geisterbahn
Rind Rinder Rinderbraten
Wild Wildschwein Wildschweinbraten
Licht Lichter Lichterkette
Held Helden Heldentat
Bär Bären Bärenhunger
Mensch Menschen Menschenmenge
Tanne Tannen Tannenzapfen
Katze Katzen Katzenjammer
Hexe Hexen Hexenhaus
Kerze Kerzen Kerzenständer
Flasche Flaschen Flaschenpost
Jacke Jacken Jackentasche
Brille Brillen Brillenetui
Banane Bananen Bananenschale
Zitrone Zitronen Zitronensaft
Tomate Tomaten Tomatensoße
Gurke Gurken Gurkensalat
Bohne Bohnen Bohnensuppe
Suppe Suppen Suppenteller
Kanone Kanonen Kanonenkugel
Welle Wellen Wellenbad
Wolke Wolken Wolkenkratzer
Biene Bienen Bienenstock
Schnecke Schnecken Schneckenhaus
Spinne Spinnen Spinnennetz
Ameise Ameisen Ameisenhaufen
Taube Tauben Taubenschlag
Ente Enten Entenbraten
Ziege Ziegen Ziegenkäse
Schlange Schlangen Schlangenlinie
Marmelade Marmeladen Marmeladenglas
Torte Torten Tortenstück
Toilette Toiletten Toilettenpapier
Seife Seifen Seifenblase
Lampe Lampen Lampenschirm
Küche Küchen Küchentisch
Garage Garagen Garagentor
Terrasse Terrassen Terrassentür
Kirche Kirchen Kirchenchor
Glocke Glocken Glockenturm
Klasse Klassen Klassenzimmer
Pause Pausen Pausenhof
Linie Linien Linienbus
Familie Familien Familienname
Rente Renten Rentenversicherung
Kunde Kunden Kundendienst
Nummer Nummern Nummernschild
Zahl Zahlen Zahlenschloss
Seite Seiten Seitenspiegel
Perle Perlen Perlenkette
Riese Riesen Riesenrad
Woche Wochen Wochenende
Stunde Stunden Stundenplan
Minute Minuten Minutenzeiger
Sekunde Sekunden Sekundenkleber
Dose Dosen Dosenöffner
Frage Fragen Fragenkatalog
Traube Trauben Traubenzucker
Pflaume Pflaumen Pflaumenkuchen
Erbse Erbsen Erbsensuppe
Linse Linsen Linsensuppe
Krawatte Krawatten Krawattennadel
Schraube Schrauben Schraubenschlüssel
Brücke Brücken Brückenpfeiler
Küste Küsten Küstenwache
Quelle Quellen Quellenangabe
Höhle Höhlen Höhlenmalerei
Wüste Wüsten Wüstensand
Palme Palmen Palmenstrand
Blüte Blüten Blütenblatt
Pflanze Pflanzen Pflanzenschutz
Stern Sternen Sternenhimmel
Planet Planeten Planetensystem
Rakete Raketen Raketenstart
Flamme Flammen Flammenmeer
Laterne Laternen Laternenumzug
Note Noten Notenschlüssel
Geige Geigen Geigenbauer
Gitarre Gitarren Gitarrensaite
Bühne Bühnen Bühnenbild
Oper Opern Opernhaus
Rolle Rollen Rollenspiel
Maske Masken Maskenball
Ware Waren Warenhaus
Kasse Kassen Kassenbon
Börse Börsen Börsenkurs
Aktie Aktien Aktiengesellschaft
Halle Hallen Hallenbad
Kabine Kabinen Kabinenpersonal
Krabbe Krabben Krabbenbrötchen
Robbe Robben Robbenbaby
Koralle Korallen Korallenriff
Ratte Ratten Rattenfänger
Fliege Fliegen Fliegenpilz
Mücke Mücken Mückenstich
Wespe Wespen Wespennest
Friede Frieden Friedensnobelpreis
Ehre Ehren Ehrenamt
Spitze Spitzen Spitzenreiter
Nase Nasen Nasenspray
Lippe Lippen Lippenstift
Zunge Zungen Zungenbrecher
Backe Backen Backenzahn
Wade Waden Wadenkrampf
Leber Leberwurst Leberwurstbrot
Blut Blutdruck Blutdruckmessgerät
Fliese Fliesen Fliesenleger
Tapete Tapeten Tapetenwechsel
Luft Luftfahrt Luftfahrtmuseum
Fall Fallschirm Fallschirmspringer
Brand Brandschutz Brandschutzübung
Klima Klimaschutz Klimaschutzgesetz
Lager Lagerfeuer Lagerfeuerromantik
Pirat Piraten Piratenschiff
Matrose Matrosen Matrosenanzug
Schleuse Schleusen Schleusentor
Atem Atemschutz Atemschutzmaske
Schokolade Schokoladen Schokoladenkuchen
Gummi Gummibär Gummibärchen
Honig Honigkuchen Honigkuchenpferd
Erdnuss Erdnussbutter Erdnussbutterbrot
Präsident Präsidentschaft Präsidentschaftswahl
Zeuge Zeugen Zeugenaussage
Spur Spuren Spurensuche
Elf Elfmeter Elfmeterschießen
Maschine Maschinen Maschinenbau Maschinenbauingenieur
Satellit Satelliten Satellitenschüssel
Taste Tasten Tastenkombination
Akte Akten Aktenkoffer
Insekt Insekten Insektenstich
Hecke Hecken Heckenschere
Eiche Eichen Eichenholz
Birke Birken Birkenwald
Linde Linden Lindenblüte
Kastanie Kastanien Kastanienbaum
Weide Weiden Weidenkorb
Socke Socken Sockenpuppe
Schwalbe Schwalben Schwalbennest
Scheune Scheunen Scheunentor
Tüte Tüten Tütensuppe
Möwe Möwen Möwenschrei
`;

export const CHAINS: readonly (readonly string[])[] = RAW.trim()
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .filter((c) => c.length > 0 && c[0] !== '');

export function chainLength(chainIndex: number): number {
  return CHAINS[chainIndex].length;
}

export function chainWord(chainIndex: number, stage: number): string {
  return CHAINS[chainIndex][stage - 1];
}

/** Index einer Kette anhand ihres Startworts (für Tests und Debug). */
export function findChain(startWord: string): number {
  const i = CHAINS.findIndex((c) => c[0] === startWord);
  if (i < 0) throw new Error(`Kette "${startWord}" nicht gefunden`);
  return i;
}
