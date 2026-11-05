import { DEFAULT_CONFIG } from '../core';
import { DEFAULT_BOT_FIELD } from '../controllers/botProfiles';
import { el, pointRateRanges, pointsLabel } from './labels';

/**
 * Anleitung: alles, was man zum Spielen wissen muss. Die Zahlen kommen direkt
 * aus der Config, damit die Erklärung nach Balancing-Änderungen stimmt.
 */
export function renderHelp(root: HTMLElement, onBack: () => void): void {
  const cfg = DEFAULT_CONFIG;
  const rates = pointRateRanges(cfg);
  const maxP = cfg.points.max;
  const t = cfg.badges.tiers;
  const b = cfg.badges.bonus.map((x) => `+${Math.round(x * 100)} %`);
  const warnS = cfg.garbage.warningMs / 1000;

  root.replaceChildren();
  const wrap = el('div', 'help');

  const top = el('div', 'help-top');
  const back = el('button', 'btn', '← Zurück zum Menü');
  back.type = 'button';
  back.addEventListener('click', onBack);
  top.append(back, el('span', 'keys', 'Esc = zurück'));

  const article = el('article', 'help-body');
  article.innerHTML = `
    <h1>Anleitung</h1>
    <p class="lead">Typing Royale ist ein Tipp-Battle-Royale: ${DEFAULT_BOT_FIELD.count + 1} Spieler tippen gleichzeitig um die Wette.
    Wer gut tippt, schickt den anderen zusätzliche Wörter. Wessen Stapel überläuft, scheidet aus.
    Der letzte Überlebende gewinnt.</p>

    <nav class="toc" aria-label="Inhalt">
      <a href="#h-ziel">Ziel</a><a href="#h-stapel">Dein Stapel</a><a href="#h-combo">Combo & Punkte</a>
      <a href="#h-muell">Müll</a><a href="#h-abwehr">Abwehr</a><a href="#h-ziele">Ziel-Strategien</a>
      <a href="#h-abzeichen">K.O.-Abzeichen</a><a href="#h-anzeige">Bildschirm</a><a href="#h-modi">Modi & Lernen</a>
      <a href="#h-tasten">Tasten</a><a href="#h-tipps">Tipps</a>
    </nav>

    <section id="h-ziel">
      <h2>Ziel des Spiels</h2>
      <p>Du spielst gegen ${DEFAULT_BOT_FIELD.count} Bots. Alle bekommen dieselben Wörter in derselben Reihenfolge, jeder in seinem eigenen Tempo. Bleib so lange wie möglich im Spiel:
      Tippe deine Wörter weg, bevor dein Stapel voll ist, und mach deinen Gegnern das Leben schwer.
      Vor jeder Runde läuft ein Countdown von ${cfg.countdownSeconds} Sekunden. Du siehst dabei schon deine ersten Wörter,
      Tastendrücke zählen aber erst ab „Los!“. Eine Runde dauert meist 4 bis 5 Minuten. Am Ende siehst du deine Platzierung, WPM (Wörter pro Minute),
      Genauigkeit, Angriffe und K.O.s.</p>
    </section>

    <section id="h-stapel">
      <h2>Dein Stapel</h2>
      <div class="help-split">
        <div>
          <p>In der Mitte liegt dein Stapel mit Platz für <b>${cfg.stackMax} Wörter</b>.
          Neue Wörter kommen regelmäßig <b>oben</b> dazu, und das Tempo steigt im Lauf der Runde.</p>
          <p>Du tippst immer das <b>unterste</b>, große Wort. Ist es fertig, verschwindet es und das nächste rutscht nach.
          Tippst du den Stapel ganz leer, bekommst du sofort ein neues Wort, ohne zu warten.
          <b>Groß- und Kleinschreibung zählen.</b> Leerzeichen und Enter brauchst du nicht.</p>
          <p>Kommt ein Wort dazu, obwohl schon ${cfg.stackMax} Wörter da sind, bist du <b>K.O.</b>
          Die Linie oben am Stapel wird rot, wenn es eng wird.</p>
        </div>
        <div class="demo-stack" aria-hidden="true">
          <div class="demo-row muted">Pelikan</div>
          <div class="demo-row muted">dünsten</div>
          <div class="demo-row garbage">◆ Haltestelle</div>
          <div class="demo-row active"><span class="ok">Aus</span><span class="cur">f</span>lug</div>
          <small>unterstes Wort = aktiv · grün = schon getippt</small>
        </div>
      </div>
    </section>

    <section id="h-combo">
      <h2>Combo & Punkte</h2>
      <p><b>Punkte</b> sind deine Währung für Angriff und Abwehr. Du siehst sie als <b style="color: var(--send)">Leiste rechts neben dem Posteingang</b>
      (höchstens ${maxP}). Darunter zeigt ein kleiner Balken, wie weit du bis zum nächsten Punkt bist.</p>
      <ul>
        <li><b>Punkte sammeln:</b> Jedes Wort, das du <b>ohne einen einzigen Tippfehler</b> fertig tippst, bringt Fortschritt zum nächsten Punkt.</li>
        <li><b>Punkte sind sicher:</b> Einmal verdient, gehen sie nicht mehr verloren – auch nicht durch Tippfehler. Nur Ausgeben (Enter/Tab) verbraucht sie.</li>
        <li><b>Maximum:</b> Hast du ${maxP} Punkte, leuchtet die Leiste <b>MAX</b>. Jeder weitere verdiente Punkt verfällt – gib sie lieber aus.</li>
      </ul>
      <p>Die <b>Combo</b> zählt deine fehlerfreien Wörter in Folge und bestimmt, <b>wie schnell</b> Punkte kommen:</p>
      <table class="help-table">
        <tr><th>Combo</th>${rates.map((r) => `<td>${r.range}</td>`).join('')}</tr>
        <tr><th>Wörter pro Punkt</th>${rates.map((r) => `<td>${r.words}</td>`).join('')}</tr>
      </table>
      <p>Ein Tippfehler setzt die Combo auf 0 – und auch den Fortschritt zum nächsten Punkt. <b>Gesammelte Punkte bleiben.</b>
      Ein Wort mit Tippfehler zählt gar nicht. Das Wort bleibt dabei stehen, du tippst einfach mit dem richtigen Buchstaben weiter; der falsche Buchstabe wackelt kurz rot.
      Punkte ausgeben ändert die Combo nicht.</p>
      <p class="example">Beispiel: Combo 12, Fortschritt 1/2. Ein Tippfehler → Combo 0, Fortschritt 0/3. Deine 5 Punkte hast du aber weiterhin.</p>
      <p>Der Rahmen um deinen Posteingang leuchtet umso stärker, je höher deine Combo ist – am hellsten ab Combo 20. Auch die Musik bekommt mit steigender Combo neue Schichten.</p>
    </section>

    <section id="h-muell">
      <h2>Müll</h2>
      <p>Wenn ein Gegner seine Punkte für einen Angriff ausgibt, schickt er dir <b>Müllwörter</b> (eins pro Punkt). Sie sind rosa und mit ◆ markiert.</p>
      <ul>
        <li><b>Vorwarnung:</b> Der rote Balken links neben deinem Stapel füllt sich ${warnS} Sekunden lang. Daneben steht, wie viele Müllwörter kommen. Kurz vor dem Einschlag pulsiert der Balken.</li>
        <li><b>Einschlag:</b> Der Müll landet direkt <b>über deinem aktiven Wort</b>. Er ist also als Nächstes dran und schiebt deinen Stapel nach oben.</li>
        <li><b>Woher der Müll kommt:</b> Ein Angreifer schickt dir seine <b>längsten eigenen Wörter</b>. Sie verschwinden aus seinem Stapel und landen in deinem. Genauso geht es umgekehrt, wenn du angreifst: Deine längsten Wörter wandern zum Gegner. Das Wort, an dem du gerade tippst, bleibt bei dir.</li>
        <li><b>Finale:</b> Sind nur noch ${cfg.garbage.finaleAtAlive} Spieler übrig, kommt vertauschte Groß-/Kleinschreibung dazu (KüHlschRank).</li>
      </ul>
    </section>

    <section id="h-abwehr">
      <h2>Angriff & Abwehr</h2>
      <p><b>Angriff mit Enter:</b> Gibt <b>alle</b> deine Punkte aus und schickt pro Punkt ein Müllwort an dein aktuelles Ziel. Unter dem Posteingang steht,
      wie viele Wörter rausgehen; die Wörter, die dabei aus deinem Posteingang verschwinden, sind <b style="color: var(--send)">bernsteinfarben</b> markiert.
      K.O.-Abzeichen machen den Angriff stärker (siehe unten).</p>
      <p><b>Abwehr mit Tab:</b> Kommt Spam auf dich zu, erscheint unter dem Posteingang <kbd>Tab</kbd> <b>Abwehren</b>. Jedes abgewehrte Wort kostet
      ${pointsLabel(cfg.defense.pointsPerWord)}; ein Druck wehrt so viel ab, wie deine Punkte bezahlen können (älteste Wörter zuerst).
      Hast du keine Punkte, wechselt <kbd>Tab</kbd> wie gewohnt die Strategie.</p>
      <p><b>Angreifen oder sparen?</b> Ein Angriff verrechnet eingehenden Müll <b>nicht</b>. Wer alle Punkte raushaut, steht beim nächsten Angriff ohne Abwehr da.
      Wer zu lange spart, verliert Punkte am Maximum.</p>
      <p class="example">Beispiel: Du hast 6 Punkte, 2 Müllwörter kommen. <kbd>Tab</kbd> → beide abgewehrt, 4 Punkte übrig. Danach <kbd>Enter</kbd> → 4 Müllwörter an dein Ziel.</p>
      <p>Eine erfolgreiche Abwehr erkennst du am grünen Aufleuchten des Warnbalkens. Die Leertaste hat im Spiel keine Funktion.</p>
    </section>

    <section id="h-ziele">
      <h2>Ziel-Strategien</h2>
      <p>Mit <kbd>Tab</kbd> wechselst du die Ziel-Strategie (außer wenn gerade Abwehr möglich ist, also Spam kommt und du Punkte hast). Mit den <b>Zifferntasten</b> wählst du einen Gegner direkt: links von oben <kbd>1</kbd>–<kbd>5</kbd>, rechts von oben <kbd>6</kbd>–<kbd>9</kbd> und <kbd>0</kbd>. Die Ziffer steht auch auf jeder Karte. Trifft dein Angriff, wackelt die Karte kurz und du hörst einen Einschlag. Ein direkt gewähltes Ziel bleibt, bis du <kbd>Tab</kbd> drückst oder es ausscheidet. Dein aktuelles Ziel steht unter dem Posteingang.</p>
      <dl class="help-dl">
        <dt>Zufall</dt><dd>Alle paar Sekunden ein neuer zufälliger Gegner.</dd>
        <dt>Angreifer</dt><dd>Wer dich gerade angreift oder anvisiert. Gut, um dich zu wehren.</dd>
        <dt>Schwache</dt><dd>Wer den vollsten Stapel hat (inkl. angekündigtem Müll). Gut, um K.O.s und damit Abzeichen zu holen.</dd>
        <dt>K.O.-Jäger</dt><dd>Wer die meisten Abzeichen hat. Bremst die Stärksten aus. Hat noch niemand Abzeichen, wird zufällig gewählt.</dd>
      </dl>
    </section>

    <section id="h-abzeichen">
      <h2>K.O.-Abzeichen</h2>
      <p>Wer jemanden K.O. schickt, bekommt <b>dessen Abzeichen plus ${cfg.badges.koBonus}</b>.
      Als K.O.-Geber zählt, wessen Müll in den letzten ${cfg.badges.koCreditWindowMs / 1000} Sekunden beim Opfer gelandet ist.
      Abzeichen machen deine Angriffe stärker:</p>
      <table class="help-table">
        <tr><th>Abzeichen</th>${t.map((x) => `<td>ab ${x}</td>`).join('')}</tr>
        <tr><th>Angriffsstärke</th>${b.map((x) => `<td>${x}</td>`).join('')}</tr>
      </table>
      <p>Bruchteile werden zufällig gerundet: Aus 1,5 Müllwörtern werden mal 1, mal 2.</p>
    </section>

    <section id="h-anzeige">
      <h2>Was du auf dem Bildschirm siehst</h2>
      <dl class="help-dl">
        <dt>Oben</dt><dd>Combo, deine aktuellen WPM, verbleibende Spieler, Rundenzeit. Darunter Ziel, Strategie und deine Abzeichen.</dd>
        <dt>Punkte-Leiste</dt><dd>Rechts neben dem Posteingang: deine Punkte (max. ${maxP}), darunter der Fortschritt zum nächsten Punkt und wie viele Wörter er bei deiner Combo braucht. Bei vollem Maximum pulsiert sie und zeigt <b>MAX</b>.</dd>
        <dt>Links & rechts</dt><dd>Die Gegner. Der Balken zeigt die Füllung ihres Stapels (grün → gelb → rot), ★ zahlt ihre Abzeichen. Ausgeschiedene sind durchgestrichen und zeigen ihren Platz.</dd>
        <dt>Grüner Pfeil</dt><dd>Zeigt auf dein aktuelles Ziel. Deine Angriffe fliegen als grüne Lichtspur dorthin.</dd>
        <dt>Roter Punkt / roter Pfeil</dt><dd>Dieser Gegner hat dir gerade Müll geschickt. Angriffe auf dich kommen als rote Lichtspur.</dd>
        <dt>Theme „Platine“</dt><dd>Jeder Gegner sitzt auf einem Anschluss der Platine. Die Leiterbahn zu deinem Ziel leuchtet bernsteinfarben, Bahnen von Angreifern pulsieren rot, und Angriffe fliegen als rote Lichtimpulse über die Bahnen. Scheidet ein Gegner aus, erlischt seine Bahn.</dd>
        <dt>Hintergrund</dt><dd>Die Partikel werden schneller, je schneller du gerade tippst.</dd>
      </dl>
    </section>

    <section id="h-modi">
      <h2>Modi & Lernen</h2>
      <dl class="help-dl">
        <dt>Deutsch / English</dt><dd>Normales Battle Royale mit deutschen bzw. englischen Wörtern.</dd>
        <dt>Endlos</dt><dd>Allein und ohne Gegner: Die Wörter kommen immer schneller, bis dein Posteingang überläuft. Gezählt wird, wie lange du durchhältst.
          Deine Bestzeit steht unten in der Kachel <b>Rekord</b>. Sobald du sie überholst, leuchtet sie auf. Mit <kbd>Esc</kbd> kannst du jederzeit aufhören, die Zeit zählt trotzdem.</dd>
        <dt>Deutsch lernen / Englisch lernen</dt><dd>Du tippst Wörter in der Lernsprache. Die Übersetzung steht klein rechts daneben, so lernst du Vokabeln nebenbei.
          Du wählst zwischen <b>Battle Royale</b> (mit Gegnern), <b>Endlos</b> und <b>In Ruhe</b> (ohne Gegner, ohne Müll, gemächliches Tempo; mit <kbd>Esc</kbd> beendest du die Runde und bekommst die Auswertung).</dd>
        <dt>Thema</dt><dd>Weltraum, Küche, Natur, Technik, Sport, Musik, Reisen oder Tiere. <b>Gemischt</b> nimmt alle, <b>Zufall</b> wählt eines aus.</dd>
        <dt>Seed</dt><dd>Startzahl für den Zufall. Gleicher Seed = gleiche Wörter in derselben Reihenfolge. Leer lassen für eine neue, zufällige Runde.</dd>
        <dt>Mehrspieler</dt><dd>Im Menü unter <b>Mehrspieler</b> einen <b>Raum erstellen</b> und den 4-stelligen Code (oder den Einladungslink) weitergeben.
          Die anderen treten mit dem Code bei. Der Gastgeber wählt Sprache, Thema und Zahl der Bots und startet die Runde – Bots füllen bis ${DEFAULT_BOT_FIELD.count + 1} Spieler auf.
          Die Runde läuft für alle weiter, Pausieren geht nicht. Bricht deine Verbindung ab, verbindet sich das Spiel automatisch neu und du steigst wieder ein. Nach deinem K.O. kannst du zuschauen. Die Auswertung kommt, wenn die Runde vorbei ist, danach geht es zurück in die Lobby.</dd>
      </dl>
    </section>

    <section id="h-tasten">
      <h2>Tasten</h2>
      <table class="help-table keys-table">
        <tr><th><kbd>Buchstaben</kbd></th><td>unterstes Wort tippen</td></tr>
        <tr><th><kbd>Enter</kbd></th><td>Angriff: alle Punkte ausgeben, 1 Müllwort pro Punkt an dein Ziel</td></tr>
        <tr><th><kbd>Tab</kbd></th><td>Spam abwehren (${pointsLabel(cfg.defense.pointsPerWord)} pro Wort), wenn welcher kommt und du Punkte hast – sonst Ziel-Strategie wechseln</td></tr>
        <tr><th><kbd>Leertaste</kbd></th><td>keine Funktion</td></tr>
        <tr><th><kbd>1</kbd>–<kbd>0</kbd></th><td>Gegner direkt anvisieren (Ziffer auf der Karte)</td></tr>
        <tr><th><kbd>F4</kbd></th><td>Ton an/aus (auch per Klick auf „Ton“; Lautstärkeregler oben im Spiel)</td></tr>
        <tr><th><kbd>F2</kbd></th><td>Debug-Anzeige: Tick-Rate, eingehender Müll, Bot-Profile</td></tr>
        <tr><th><kbd>Esc</kbd></th><td>Zurück zum Menü (auch per Klick auf „Menü“). Im Spiel fragt das Spiel nach und pausiert so lange; ohne Gegner gibt es danach die Auswertung.</td></tr>
      </table>
    </section>

    <section id="h-tipps">
      <h2>Tipps</h2>
      <ul>
        <li><b>Genauigkeit vor Tempo:</b> Ein Fehler kostet die ganze Combo – ab Combo 10 und 20 kommen Punkte deutlich schneller. Lieber etwas langsamer und sauber.</li>
        <li><b>Reserve behalten:</b> Ein paar Punkte für <kbd>Tab</kbd> retten dich, wenn ein großer Angriff kommt.</li>
        <li><b>Nicht am Maximum sitzen:</b> Bei ${maxP} Punkten verfällt alles Weitere – dann lieber angreifen.</li>
        <li><b>Schwache</b> bringt Abzeichen, <b>Angreifer</b> schützt dich, <b>K.O.-Jäger</b> bremst die Spitze.</li>
        <li>Angreifen entlastet: Jeder Angriff schickt deine längsten Wörter weg.</li>
        <li>Im Finale Müllwörter in Ruhe lesen: Bei gemischter Schreibung passieren die meisten Fehler.</li>
        <li>Wenn dich Effekte ablenken: Im Menü unter „Sound & Effekte“ kannst du sie reduzieren.</li>
      </ul>
    </section>`;

  // Sprungmarken im Inhaltsverzeichnis: weich scrollen statt URL ändern
  article.querySelectorAll<HTMLAnchorElement>('.toc a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      article.querySelector(a.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  wrap.append(top, article);
  root.append(wrap);
  back.focus();
}
