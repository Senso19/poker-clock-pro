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

- **Règles RLS** sur les 18 tables de l'horloge.
- **Retrait des droits excessifs** du rôle `anon`.
- Les deux avertissements de l'audit Supabase (vue `v_recap_mensuel`,
  `search_path` de `set_updated_at`).

## Hors périmètre, et toujours ouvert

Cette base sert aussi **le site des finances** (`ecritures`, `releves`,
`saisons`, `categories`) et une **application mariage** (`wedding_*`). Ni
l'une ni l'autre n'a d'authentification : la même clé publique y donne
toujours tous les droits. Aucun lien ne les relie aux tables de l'horloge
(aucune clé étrangère, aucune fonction commune), donc sécuriser l'horloge ne
les casse pas — mais ne les protège pas non plus.

## La correspondance pseudo → adresse

On se connecte avec son pseudo. L'adresse d'authentification en est dérivée
des deux côtés, sans jamais interroger la base :

- en base : `public.email_auth_du_pseudo()`
- dans le code : `emailAuthDuPseudo()` (`src/lib/auth.js`)

Les deux doivent rester identiques. `Sens0_` → `sens0@membres.19pokerclub.fr`.
