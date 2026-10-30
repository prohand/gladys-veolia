# Veolia — consommation d'eau

Cette intégration lit votre consommation d'eau dans votre **espace client
Veolia** (eau.veolia.fr) et l'affiche dans Gladys : un appareil « compteur
d'eau », un widget de tableau de bord, et des cartes pour vos scènes.

## Ce qu'il vous faut

- Un compteur d'eau **télérelevé** : c'est lui qui envoie chaque jour votre
  consommation à Veolia. Sans télérelève, Veolia n'a qu'un relevé par an.
- Un **espace client Veolia** avec e-mail et mot de passe. Vérifiez que vous
  voyez bien votre consommation par jour sur le site Veolia.
- Gladys **5.3 ou plus récent**.

Votre commune est-elle servie par Veolia ? Dans l'écran de configuration,
utilisez le bouton **Vérifier ma commune** avec votre code postal. Par
exemple, Metz (57000) répond « Compatible, portail eau.veolia.fr ».

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail** et le **mot de passe** de votre espace client.
3. **Espace client** : gardez `eau.veolia.fr`, sauf si le bouton _Vérifier ma
   commune_ vous indique un autre portail (Eau de Toulouse Métropole, Vendée
   Eau, C Mon O, Nantes Métropole…).
4. Réglages facultatifs :
   - **Intervalle de rafraîchissement** (6 h par défaut) : Veolia ne publie
     qu'un relevé par jour, inutile de descendre très bas ;
   - **Seuil de forte consommation** (L/jour) : 0 = désactivé. Au-dessus, le
     déclencheur _Forte consommation d'eau_ part ;
   - **Relevé manquant après** (3 jours par défaut) : délai avant le
     déclencheur _Relevé d'eau en retard_.
5. Enregistrez, puis cliquez sur **Tester la connexion** : le message affiche
   votre compteur et le dernier relevé.
6. Ouvrez l'onglet **Découverte** et ajoutez le compteur d'eau.

À l'ajout de l'appareil, l'historique connu (le mois en cours et le mois
précédent) est envoyé à Gladys, **à la date de chaque relevé**.

Ensuite, l'intégration récupère chez Veolia les **24 mois précédents** et les
range aussi à leur date : les graphiques de Gladys peuvent alors montrer les
années passées. Cet import se fait en tâche de fond, un mois toutes les
20 secondes (environ 8 minutes). Il n'y a aucun fichier à fournir : Veolia
garde l'historique. Si Gladys efface les anciens états (réglage de
conservation de l'historique dans **Paramètres → Système**), choisissez une
durée d'au moins 2 ans pour les garder.

## L'appareil « Compteur d'eau »

| Valeur                   | Unité | Ce que c'est                                             |
| ------------------------ | ----- | -------------------------------------------------------- |
| Index                    | m³    | Index du compteur au dernier relevé                      |
| Consommation journalière | L     | Litres consommés chaque jour, rangés à la date du relevé |
| Consommation du mois     | m³    | Total du mois en cours                                   |
| Consommation de l'année  | m³    | Total de l'année civile en cours                         |

La carte de l'appareil porte le badge **Cloud** quand le portail
Veolia répond, **Injoignable** quand il ne répond pas, avec un point orange
quand aucun relevé n'est arrivé depuis le délai « Relevé manquant après ».
Il n'y a pas de mode local : les données n'existent que chez Veolia.

Bon à savoir : Veolia publie un relevé avec **1 à 3 jours de retard**. Il
est normal de ne pas voir la consommation d'hier.

## Tableau de bord

Ajoutez le widget **Consommation d'eau** : dernier jour, mois, année, index,
un graphique par jour (7, 14 ou 30 jours, au choix dans le widget), la date et
la fiabilité du dernier relevé (mesuré ou estimé), et un bouton
**Rafraîchir**. Si vous avez plusieurs compteurs, choisissez-le dans les
réglages du widget.

Le widget **Eau : comparaison des années** montre la consommation de chaque
mois des 3 dernières années, côte à côte, le total de chaque année, et
l'écart avec l'an dernier sur la même période (de janvier au dernier mois
complet). Ses chiffres viennent directement de Veolia : il marche même si
Gladys n'a pas gardé l'historique.

## Scènes

L'intégration ajoute ses cartes dans l'éditeur de scènes, catégorie
**Intégrations**.

Déclencheurs :

- **Nouveau relevé d'eau** — Veolia a publié une nouvelle journée. Variables :
  `{{triggerEvent.data.date}}`, `{{triggerEvent.data.liters}}`,
  `{{triggerEvent.data.index_m3}}`.
- **Forte consommation d'eau** — une journée a atteint le seuil réglé
  (fuite possible). Variables : `date`, `liters`, `threshold_liters`.
- **Relevé d'eau en retard** — aucun nouveau relevé depuis le nombre de jours
  réglé (compteur ou portail en panne). Variables : `last_date`, `days`.

Actions :

- **Rafraîchir la consommation d'eau** — lit Veolia tout de suite et renvoie
  le dernier relevé (`date`, `liters`, `index_m3`).
- **Obtenir la consommation d'eau** — renvoie la consommation d'une période
  (dernier jour relevé, ce mois-ci, le mois dernier, cette année) en litres et
  en m³, pour un message ou une condition.

Exemple : « chaque 1er du mois à 9 h, obtenir la consommation du mois dernier
et m'envoyer : _Le mois dernier : {{…cubic_meters}} m³_ ».

## Dépannage

- **« Veolia a refusé l'e-mail ou le mot de passe »** : connectez-vous sur le
  site Veolia avec les mêmes identifiants. Si Veolia vous demande de changer
  votre mot de passe, faites-le sur le site, puis mettez à jour Gladys.
- **« WAF block »** dans le statut : Veolia (via AWS) bloque certaines
  adresses de serveurs (hébergeurs, VPN). Depuis une box internet classique,
  cela ne devrait pas arriver.
- **Pas de consommation journalière** : votre compteur n'est sans doute pas
  télérelevé. Vérifiez sur le site Veolia.
- **Commune « pas encore prise en charge »** : votre commune a son propre
  portail Veolia. Ouvrez une demande sur le dépôt GitHub en donnant l'adresse
  du portail.

## Vos données

- Vos identifiants restent dans la configuration de Gladys. Ils ne sont
  envoyés qu'à Veolia (service de connexion AWS Cognito) et jamais écrits
  dans les journaux.
- L'intégration ne lit que vos données de consommation. Elle ne modifie rien
  sur votre compte Veolia.
- Veolia ne fournit pas d'API officielle pour ces données : l'intégration fait
  comme le site web. Si Veolia change son site, elle peut cesser de marcher
  jusqu'à une mise à jour.
