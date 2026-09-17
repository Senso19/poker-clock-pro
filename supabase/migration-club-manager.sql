-- Rôle "gestionnaire de club" et tournois interclubs
-- À exécuter dans le SQL Editor Supabase (idempotent, rejouable sans risque).

-- Nom du club affilié. Renseigné par l'admin sur un compte "club_manager"
-- (onglet "Gérer les membres"), puis hérité automatiquement par les membres
-- que ce gestionnaire crée depuis "Mon club".
alter table accounts
  add column if not exists club_name text;

-- Marque un tournoi comme "interclubs" : seul type de tournoi qu'un
-- gestionnaire de club peut gérer, et seul type visible par les comptes
-- affiliés à un club externe.
alter table tournaments
  add column if not exists is_interclub boolean not null default false;

-- Utilisé par fetchClubMembers() et le plafond d'inscriptions par club.
create index if not exists accounts_club_name_idx on accounts (club_name);
