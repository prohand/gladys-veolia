# Veolia — Wasserverbrauch

Diese Integration liest Ihren Wasserverbrauch aus Ihrem **Veolia-Kundenkonto**
(eau.veolia.fr) und bringt ihn in Gladys: ein Gerät „Wasserzähler“, ein
Dashboard-Widget und Karten für Ihre Szenen.

## Was Sie brauchen

- Einen **fernablesbaren** Wasserzähler (télérelève): Er sendet Ihren Verbrauch
  jeden Tag an Veolia. Ohne ihn hat Veolia nur einen Messwert pro Jahr.
- Ein **Veolia-Kundenkonto** mit E-Mail-Adresse und Passwort. Prüfen Sie, dass
  die Veolia-Website Ihren Verbrauch Tag für Tag anzeigt.
- Gladys **5.1 oder neuer**.

Wird Ihre Gemeinde von Veolia versorgt? Nutzen Sie im Tab **Konfiguration** die
Schaltfläche **Meine Gemeinde prüfen** mit Ihrer Postleitzahl. Für Metz (57000)
lautet die Antwort zum Beispiel „Unterstützt, Portal eau.veolia.fr“.

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Geben Sie die **E-Mail-Adresse** und das **Passwort** Ihres Kundenkontos ein.
3. **Kundenportal**: Behalten Sie `eau.veolia.fr`, außer _Meine Gemeinde prüfen_
   nennt ein anderes Portal (Eau de Toulouse Métropole).
4. Optionale Einstellungen:
   - **Aktualisierungsintervall** (standardmäßig 6 h): Veolia veröffentlicht
     einen Messwert pro Tag, ein kurzes Intervall bringt nichts;
   - **Schwelle für hohen Verbrauch** (L/Tag): 0 = aus. Ab diesem Wert löst der
     Auslöser _Hoher Wasserverbrauch_ aus;
   - **Fehlender Messwert nach** (standardmäßig 3 Tage): Frist bis zum
     Auslöser _Wasser-Messwert überfällig_.
5. Speichern Sie und klicken Sie dann auf **Verbindung testen**: Die Antwort
   zeigt Ihren Zähler und seinen letzten Messwert.
6. Öffnen Sie den Tab **Entdecken** und fügen Sie den Wasserzähler mit **Zu
   Gladys hinzufügen** hinzu.

Sobald das Gerät hinzugefügt ist, wird der bekannte Verlauf (der aktuelle und
der vorherige Monat) an Gladys gesendet, **datiert auf den jeweiligen Tag des
Messwerts**.

Danach holt die Integration die **24 vorherigen Monate** bei Veolia ab, ebenfalls
auf ihren Tag datiert, damit die Gladys-Diagramme die vergangenen Jahre zeigen
können. Der Import läuft im Hintergrund, ein Monat alle 20 Sekunden (etwa
8 Minuten). Sie müssen keine Datei bereitstellen: Veolia bewahrt den Verlauf
auf. Wenn Gladys alte Zustände löscht (die Einstellung **Gerätestatusverlauf
behalten** unter **Einstellungen → System**), wählen Sie mindestens 2 Jahre, um
sie zu behalten.

## Das Gerät „Wasserzähler“

| Wert                     | Einheit | Bedeutung                                       |
| ------------------------ | ------- | ----------------------------------------------- |
| Index                    | m³      | Zählerstand beim letzten Messwert               |
| Consommation journalière | L       | Täglich verbrauchte Liter, am Tag des Messwerts |
| Consommation du mois     | m³      | Summe des aktuellen Monats                      |
| Consommation de l'année  | m³      | Summe des aktuellen Kalenderjahres              |

Die Gerätekarte trägt das Abzeichen **Cloud**, solange das Veolia-Portal
antwortet, **Nicht erreichbar**, wenn es nicht antwortet, mit einem orangefarbenen
Punkt, wenn innerhalb der Frist „Fehlender Messwert nach“ kein Messwert kam. Es
gibt keinen lokalen Modus: Die Daten existieren nur bei Veolia.

Gut zu wissen: Veolia veröffentlicht einen Messwert **1 bis 3 Tage verspätet**.
Dass Sie den Verbrauch von gestern nicht sehen, ist normal.

## Dashboard

Fügen Sie das Widget **Wasserverbrauch** hinzu: letzter Tag, Monat, Jahr,
Zählerstand, ein Tagesdiagramm (7, 14 oder 30 Tage, im Widget einstellbar), das
Datum und die Zuverlässigkeit des letzten Messwerts (gemessen oder geschätzt)
und eine Schaltfläche **Aktualisieren**. Bei mehreren Zählern wählen Sie einen in
den Einstellungen des Widgets.

Das Widget **Wasser: Jahresvergleich** zeigt den Verbrauch jedes Monats der
letzten 3 Jahre nebeneinander, die Summe jedes Jahres und die Veränderung
gegenüber dem Vorjahr über denselben Zeitraum (Januar bis zum letzten
vollständigen Monat). Seine Zahlen kommen direkt von Veolia: Es funktioniert
auch, wenn Gladys den Verlauf nicht aufbewahrt hat.

## Szenen

Die Integration fügt ihre Karten dem Szeneneditor hinzu, unter
**Integrationen**.

Auslöser:

- **Neuer Wasser-Messwert** — Veolia hat einen neuen Tag veröffentlicht.
  Variablen: `{{triggerEvent.data.date}}`, `{{triggerEvent.data.liters}}`,
  `{{triggerEvent.data.index_m3}}`.
- **Hoher Wasserverbrauch** — ein Tag hat die von Ihnen eingestellte Schwelle
  erreicht (mögliches Leck). Variablen: `date`, `liters`, `threshold_liters`.
- **Wasser-Messwert überfällig** — kein neuer Messwert seit der von Ihnen
  eingestellten Anzahl von Tagen (Zähler oder Portal ausgefallen). Variablen:
  `last_date`, `days`.

Aktionen:

- **Wasserverbrauch aktualisieren** — liest Veolia jetzt und gibt den neuesten
  Messwert zurück (`date`, `liters`, `index_m3`).
- **Wasserverbrauch abrufen** — gibt den Verbrauch eines Zeitraums zurück
  (letzter abgelesener Tag, dieser Monat, letzter Monat, dieses Jahr) in Litern
  und m³, für eine Nachricht oder eine Bedingung.

Beispiel: „jeden 1. des Monats um 9:00 den Verbrauch des letzten Monats abrufen
und mir senden: _Letzter Monat: {{…cubic_meters}} m³_“.

## Fehlerbehebung

- **„Veolia hat die E-Mail-Adresse oder das Passwort abgelehnt“**: Melden Sie
  sich mit denselben Zugangsdaten auf der Veolia-Website an. Wenn Veolia ein
  neues Passwort verlangt, ändern Sie es dort und aktualisieren Sie dann Gladys.
- **„WAF block“** im Status: Veolia (über AWS) sperrt einige Serveradressen
  (Hosting-Anbieter, VPNs). Von einem normalen Heimanschluss aus sollte das
  nicht passieren.
- **Kein täglicher Verbrauch**: Ihr Zähler ist wahrscheinlich nicht
  fernablesbar. Prüfen Sie es auf der Veolia-Website.
- **Gemeinde „noch nicht unterstützt“**: Ihre Gemeinde hat ein eigenes
  Veolia-Portal. Eröffnen Sie ein Issue im GitHub-Repository mit der Adresse des
  Portals.

## Ihre Daten

- Ihre Zugangsdaten bleiben in der Gladys-Konfiguration. Sie werden nur an
  Veolia gesendet (seinen Anmeldedienst AWS Cognito) und nie in die Protokolle
  geschrieben.
- Die Integration liest nur Ihren Verbrauch. Sie ändert nichts an Ihrem
  Veolia-Konto.
- Veolia bietet für diese Daten keine offizielle API: Die Integration macht das,
  was die Website macht. Wenn Veolia seine Website ändert, kann sie bis zu einem
  Update nicht mehr funktionieren.
