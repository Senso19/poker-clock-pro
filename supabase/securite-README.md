# Sécurisation de PokerClock — état des travaux

Avant ces migrations, l'authentification était maison : un pseudo, un mot de
passe **en clair** dans `accounts`, comparé dans le navigateur. La base ne
voyait qu'un visiteur anonyme, toujours le même, et la clé publique du site
donnait à n'importe qui le droit de tout lire, modifier et effacer.

Les migrations sont appliquées sur le projet Supabase `gpmpghjqkhuobcnqgasm`
et enregistrées dans son historique. Ce fichier dit où on en est.

## Appliqué

| # | Migration | Effet |
|---|---|---|
| 1 | `auth_migrer_comptes_vers_supabase_auth` | Chaque compte reçoit une identité Supabase Auth, **avec son mot de passe existant** (bcrypt). Colonne `accounts.auth_user_id`. Invisible pour les utilisateurs. |
| 2 | `securite_fonctions_identite_et_permissions` | `mon_compte()`, `mon_role()`, `ma_permission()` : la base sait enfin qui demande. Table `role_permissions_defaut`, extraite du code et non recopiée. |
| 3 | `securite_connexion_de_secours` | `connexion_de_secours(pseudo, mdp)` : vérifie un mot de passe sans jamais le renvoyer. Filet le temps de la bascule. |
| 4 | `securite_effacer_mots_de_passe_en_clair` | Déclencheur qui synchronise l'identité Auth à chaque écriture et **efface le mot de passe en clair**. Plus rien à voler dans `accounts`. |
| 5 | `securite_corriger_jetons_auth_nuls` | Correctif indispensable, voir ci-dessous. |

## Le piège des jetons nuls

Créer un utilisateur directement dans `auth.users` en SQL ne suffit pas :
le service d'authentification de Supabase (GoTrue, en Go) lit plusieurs
colonnes de jetons comme des chaînes **non nulles**. Laissées à NULL, toute
connexion échoue avec :

```
error finding user: Scan error on column "confirmation_token":
converting NULL to string is unsupported
```

Quatre colonnes doivent valoir `''` et non NULL : `confirmation_token`,
`recovery_token`, `email_change_token_new`, `email_change`. Les autres
(`email_change_token_current`, `phone_change`, `phone_change_token`,
`reauthentication_token`) ont déjà `''` par défaut.

Le déclencheur `accounts_sync_identite` les pose désormais à la création.
Si un jour vous créez un compte autrement qu'en passant par la table
`accounts`, pensez-y.

## Reste à faire

| # | Migration | Effet |
|---|---|---|
| 6 | `securite_rls_verrouiller_les_ecritures` | RLS sur les 19 tables de l'horloge. Chaque écriture est confrontée à `ma_permission()`. Déclencheur `accounts_proteger_droits`. Voie de secours supprimée. |
| 7 | `securite_rls_visibilite_par_role` | La visibilité des tournois et championnats suit le rôle, côté serveur. Les tables liées à un tournoi suivent sa visibilité. Les messages à l'admin ne sont lus que par l'admin. |
| 8 | `securite_retirer_droits_excessifs_anon` | `TRUNCATE`, `TRIGGER`, `REFERENCES` retirés sur les 25 tables. Table des permissions en lecture seule. |
| 9 | `securite_retirer_fonctions_declencheur_de_api` | Les deux fonctions de déclencheur sortent de l'API. |

| 10 | `securite_clore_tournoi_par_celui_qui_elimine` | Fonction `clore_tournoi()` : clore est la conséquence d'une élimination, pas un acte de gestion. |
| 11 | `securite_inscription_et_mot_de_passe_oublie` | `inscrire_compte()` et `demander_reinitialisation()` : deux gestes d'un visiteur sans compte, que la règle sur `accounts` bloquait forcément. Le code du club est désormais vérifié en base. |
| 12 | `securite_rls_alleger_les_lectures` | `FOR ALL` inclut la LECTURE : chaque table avait deux règles de lecture. Séparées en INSERT / UPDATE / DELETE. |
| 13 | `securite_rls_evaluer_les_permissions_une_seule_fois` | **85 ms → 1,5 ms** pour lire 500 inscrits. Voir ci-dessous. |

## Les deux pièges de performance de la RLS

**`FOR ALL` inclut `SELECT`.** Une règle d'écriture déclarée `FOR ALL`
s'ajoute aux règles de lecture, et PostgreSQL les combine par OU : chaque
lecture évaluait donc les deux. Il faut déclarer explicitement
`FOR INSERT` / `FOR UPDATE` / `FOR DELETE`.

**Une fonction dans une règle est appelée À CHAQUE LIGNE.** Lire les 500
inscrits d'un gros tournoi prenait **85 ms**, contre 0,87 ms avant la RLS —
`ma_permission()` était évaluée 500 fois alors que son verdict ne dépend que
du demandeur. En l'enfermant dans une sous-requête scalaire, PostgreSQL la
sort de la boucle :

```sql
-- 85 ms pour 500 lignes
USING (public.ma_permission('viewAllTournaments') OR ...)

-- 1,5 ms pour 500 lignes
USING ((SELECT public.ma_permission('viewAllTournaments')) OR ...)
```

Même parade que le `(select auth.uid())` recommandé par Supabase. Toute
nouvelle règle doit suivre cette forme.

**Un test de visibilité par ligne coûte cher.** Pour les tables liées à un
tournoi, la règle commence par `viewAllTournaments` — vrai pour un membre et
au-dessus, c'est-à-dire la quasi-totalité du trafic. Le détail par tournoi
n'est évalué que pour un visiteur ou un invité, sur des listes courtes.

## Le piège de l'auto-promotion

La règle d'écriture sur `accounts` laisse un membre modifier SA fiche — ce
qui est légitime. Mais une fiche porte la colonne `role` : sans garde,
n'importe quel joueur se nommait administrateur en une requête. Une épreuve
l'a montré avant la mise en service.

Le déclencheur `accounts_proteger_droits` remet donc silencieusement `role`,
`validated`, `is_owner`, `club_name` et `auth_user_id` à leur valeur
d'origine pour quiconque n'a pas `manageAccounts`.

**Conséquence pour les essais** : ce garde s'applique aussi en SQL direct.
Pour changer un rôle à la main, il faut d'abord
`ALTER TABLE accounts DISABLE TRIGGER accounts_proteger_droits`.

## Pièges rencontrés en éprouvant les règles

- Une écriture refusée par RLS **n'échoue pas toujours** : un `UPDATE` ou un
  `DELETE` interdit touche simplement zéro ligne, sans erreur. Seul un
  `INSERT` lève `42501`. Un test qui ne regarde que les erreurs conclut à
  tort que tout va bien.
- `SET LOCAL ROLE anon` **ne vide pas** `request.jwt.claims`. Sans
  `set_config('request.jwt.claims','',true)`, on croit tester un visiteur
  alors qu'on teste encore l'utilisateur précédent.
- Un `SELECT` qui rend zéro ligne peut vouloir dire « interdit » **ou**
  « table vide ». Il faut insérer une ligne de contrôle avant de conclure.

## Ce qui reste ouvert, sciemment

**Les données nominatives restent lisibles** avec la clé publique :
`accounts` (noms, prénoms, e-mails), `players` (le fichier des joueurs) et
`form_submissions` (les inscriptions). Restreindre ces lectures demande de
retravailler plusieurs requêtes de l'application :

- `TableBalanceContext` joint `accounts(pseudo, club_name)` aux inscriptions ;
- `avatarsCache` lit `accounts(id, avatar_data)` ;
- **la vérification des doublons du formulaire public lit
  `form_submissions`** — et si cette lecture était refusée, elle ne
  planterait pas : elle cesserait simplement de détecter les doublons, en
  silence. C'est le piège à éviter absolument.

La voie propre est une vue des champs publics et une fonction serveur pour
le contrôle des doublons. Ce n'est pas fait.

**Protection contre les mots de passe éventés** : Supabase sait refuser les
mots de passe connus des fuites publiques (HaveIBeenPwned). C'est une case à
cocher dans les réglages d'authentification du projet, pas du SQL.

## Hors périmètre, et toujours ouvert

Cette base sert aussi **le site des finances** (`ecritures`, `releves`,
`saisons`, `categories`) et une **application mariage** (`wedding_*`). Ni
l'une ni l'autre n'a d'authentification : la même clé publique y donne
toujours le droit de lire, modifier et effacer. Seul `TRUNCATE` leur a été
retiré.

Aucun lien ne les relie aux tables de l'horloge (aucune clé étrangère,
aucune fonction commune) : les sécuriser plus tard ne demandera pas de
revenir sur ce qui vient d'être fait.

## La correspondance pseudo → adresse

On se connecte avec son pseudo. L'adresse d'authentification en est dérivée
des deux côtés, sans jamais interroger la base :

- en base : `public.email_auth_du_pseudo()`
- dans le code : `emailAuthDuPseudo()` (`src/lib/auth.js`)

Les deux doivent rester identiques. `Sens0_` → `sens0@membres.19pokerclub.fr`.
