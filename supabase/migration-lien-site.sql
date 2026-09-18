-- Adresse publique du site du club, pour le QR code et l'affiche
-- d'adhésion des Paramètres du club.
--
-- Elle est stockée plutôt que déduite de window.location : l'adresse
-- depuis laquelle l'admin travaille n'est pas forcément celle qu'on
-- donne aux joueurs (aperçu de déploiement, adresse locale, nom de
-- domaine propre au club). Vide = on retombe sur l'adresse courante.
alter table public.club_settings add column if not exists site_url text;
