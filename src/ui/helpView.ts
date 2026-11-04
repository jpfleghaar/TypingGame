import { DEFAULT_CONFIG } from '../core';
import { DEFAULT_BOT_FIELD } from '../controllers/botProfiles';
import { el } from './labels';

/**
 * Anleitung: alles, was man zum Spielen wissen muss. Die Zahlen kommen direkt
 * aus der Config, damit die Erklärung nach Balancing-Änderungen stimmt.
 */
export function renderHelp(root: HTMLElement, onBack: () => void): void {
  const cfg = DEFAULT_CONFIG;
  const combos = cfg.combo.thresholds;
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
      <a href="#h-ziel">Ziel</a><a href="#h-stapel">Dein Stapel</a><a href="#h-combo">Combos</a>
      <a href="#h-muell">Müll</a><a href="#h-abwehr">Abwehr</a><a href="#h-ziele">Ziel-Strategien</a>
      <a href="#h-abzeichen">K.O.-Abzeichen</a><a href="#h-anzeige">Bildschirm</a><a href="#h-modi">Modi & Lernen</a>
      <a href="#h-uebung">Übungsliste</a><a href="#h-tasten">Tasten</a><a href="#h-tipps">Tipps</a>
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
          <div class="demo-row garbage">◆ MondKrater</div>
          <div class="demo-row active"><span class="ok">Aus</span><span class="cur">f</span>lug</div>
          <small>unterstes Wort = aktiv · grün = schon getippt</small>
        </div>
      </div>
    </section>

    <section id="h-combo">
      <h2>Combos</h2>
      <p>Jedes Wort, das du <b>ohne Tippfehler</b> fertig tippst, erhöht deine Combo um 1.
      Ein Tippfehler setzt sie auf 0. Das Wort bleibt dabei stehen, du tippst einfach mit dem richtigen Buchstaben weiter.
      Der falsche Buchstabe wackelt kurz rot.</p>
      <table class="help-table">
        <tr><th>Combo</th>${combos.map((c) => `<td>${c.combo}</td>`).join('')}<td>danach alle ${cfg.combo.repeatEvery} Wörter</td></tr>
        <tr><th>Müll an Gegner</th>${combos.map((c) => `<td>${c.garbage} ${c.garbage > 1 ? 'Wörter' : 'Wort'}</td>`).join('')}<td>${cfg.combo.repeatGarbage} Wörter</td></tr>
      </table>
      <p>Der Bildschirmrand leuchtet umso stärker grün, je höher deine Combo ist. Auch die Musik bekommt mit steigender Combo neue Schichten.</p>
    </section>

    <section id="h-muell">
      <h2>Müll</h2>
      <p>Wenn ein Gegner eine Combo-Stufe erreicht, schickt er dir <b>Müllwörter</b>. Sie sind rosa und mit ◆ markiert.</p>
      <ul>
        <li><b>Vorwarnung:</b> Der rote Balken links neben deinem Stapel füllt sich ${warnS} Sekunden lang. Daneben steht, wie viele Müllwörter kommen. Kurz vor dem Einschlag pulsiert der Balken.</li>
        <li><b>Einschlag:</b> Der Müll landet direkt <b>über deinem aktiven Wort</b>. Er ist also als Nächstes dran und schiebt deinen Stapel nach oben.</li>
        <li><b>Schwierigkeit:</b> Am Anfang ist Müll ein normales langes Wort. Mit der Zeit kommen zusammengesetzte Wörter (MondKrater), Riesenwörter (Donaudampfschifffahrt) und vertauschte Groß-/Kleinschreibung (KüHlschrank) dazu.</li>
      </ul>
    </section>

    <section id="h-abwehr">
      <h2>Abwehr</h2>
      <p>Löst du selbst einen Angriff aus, während Müll zu dir unterwegs ist, wird zuerst <b>der eingehende Müll verrechnet</b>.
      Nur der Rest geht an deinen Gegner.</p>
      <p class="example">Beispiel: 2 Müllwörter kommen auf dich zu. Du erreichst Combo 6 (= 2 Müll). Ergebnis: Der eingehende Müll ist komplett weg, an den Gegner geht nichts.
      Hättest du Combo 10 erreicht (= 3 Müll), ginge 1 Wort an den Gegner.</p>
      <p>Eine erfolgreiche Abwehr erkennst du am grünen Aufleuchten des Warnbalkens.</p>
    </section>

    <section id="h-ziele">
      <h2>Ziel-Strategien</h2>
      <p>Mit <kbd>Tab</kbd> wechselst du, wen deine Angriffe treffen. Dein aktuelles Ziel siehst du über dem Stapel und am grünen Pfeil zur Gegner-Karte.</p>
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
        <dt>Deutsch lernen / Englisch lernen</dt><dd>Du tippst Wörter in der Lernsprache. Die Übersetzung steht klein rechts daneben, so lernst du Vokabeln nebenbei.
          Du wählst zwischen <b>Battle Royale</b> (mit Gegnern) und <b>In Ruhe</b> (ohne Gegner, ohne Müll, gemächliches Tempo; mit <kbd>Esc</kbd> beendest du die Runde und bekommst die Auswertung).</dd>
        <dt>Thema</dt><dd>Weltraum, Küche, Natur, Technik, Sport, Musik, Reisen oder Tiere. <b>Gemischt</b> nimmt alle, <b>Zufall</b> wählt eines aus.</dd>
        <dt>Seed</dt><dd>Startzahl für den Zufall. Gleicher Seed = gleiche Wörter in derselben Reihenfolge. Leer lassen für eine neue, zufällige Runde.</dd>
      </dl>
    </section>

    <section id="h-uebung">
      <h2>Übungsliste</h2>
      <p>Nach jeder Runde schaut das Spiel, welche Wörter dir <b>im Verhältnis zu deinem eigenen Schnitt</b> schwerer fielen,
      weil sie langsamer waren oder Fehler hatten. Diese Wörter landen in deiner Übungsliste im Menü (getrennt nach Sprache).
      Mit „Üben (ohne Gegner)“ tippst du nur diese Wörter. Einzelne Wörter entfernst du mit ×.</p>
    </section>

    <section id="h-tasten">
      <h2>Tasten</h2>
      <table class="help-table keys-table">
        <tr><th><kbd>Buchstaben</kbd></th><td>unterstes Wort tippen</td></tr>
        <tr><th><kbd>Tab</kbd></th><td>Ziel-Strategie wechseln</td></tr>
        <tr><th><kbd>F4</kbd></th><td>Ton an/aus (Lautstärke im Menü)</td></tr>
        <tr><th><kbd>F2</kbd></th><td>Debug-Anzeige: Tick-Rate, eingehender Müll, Bot-Profile</td></tr>
        <tr><th><kbd>Esc</kbd></th><td>Runde abbrechen (ohne Gegner: Runde beenden und auswerten)</td></tr>
      </table>
    </section>

    <section id="h-tipps">
      <h2>Tipps</h2>
      <ul>
        <li><b>Genauigkeit vor Tempo:</b> Ein Fehler kostet die ganze Combo. Lieber etwas langsamer und sauber.</li>
        <li><b>Combo halten, wenn Müll kommt:</b> Ein Angriff kurz vor dem Einschlag wehrt ihn ab.</li>
        <li><b>Schwache</b> bringt Abzeichen, <b>Angreifer</b> schützt dich, <b>K.O.-Jäger</b> bremst die Spitze.</li>
        <li>Müllwörter in Ruhe lesen: Bei gemischter Schreibung (KüHlschrank) passieren die meisten Fehler.</li>
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
