-- Colonnes orphelines — À RELIRE AVANT DE L'EXÉCUTER
--
-- Ce fichier n'a PAS été appliqué : il supprime des colonnes, donc leurs
-- données. Relis-le, puis lance-le depuis l'éditeur SQL de Supabase quand
-- tu es d'accord. Rien dans l'application ne lit plus ces colonnes — c'est
-- vérifiable : aucune occurrence de leur nom dans src/.
--
-- Une sauvegarde d'abord, si tu veux pouvoir revenir en arrière :
--   create table _sauvegarde_colonnes_orphelines as
--     select t.id, t.current_level_index, t.level_started_at from tournaments t;
--   create table _sauvegarde_club_settings_orphelines as
--     select c.id, c.live_announcement, c.live_announcement_updated_at,
--            c.sheets_webhook_url from club_settings c;

-- 1. Ancienne horloge, remplacée par les colonnes clock_*.
--    L'horloge actuelle écrit clock_level_index / clock_seconds_left /
--    clock_is_running / clock_updated_at ; ces deux-là ne bougent plus.
alter table tournaments drop column if exists current_level_index;
alter table tournaments drop column if exists level_started_at;

-- 2. Message live du panneau Annonces, remplacé par la table
--    tournament_announcements (une annonce par ligne, avec péremption).
alter table club_settings drop column if exists live_announcement;
alter table club_settings drop column if exists live_announcement_updated_at;

-- 3. Webhook Google Sheets : la fonction qui l'utilisait n'a jamais été
--    branchée à un bouton. L'import/export Excel, lui, reste et ne passe
--    pas par là.
alter table club_settings drop column if exists sheets_webhook_url;
