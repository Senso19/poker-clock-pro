-- Mise à jour en direct des panneaux de l'horloge
-- ------------------------------------------------------------------
-- Problème : une modification de panneau (taille, position, couleur)
-- faite depuis un appareil n'atteignait jamais l'horloge affichée sur un
-- autre écran. Les données du tournoi, elles, étaient déjà sondées toutes
-- les 5 secondes — d'où l'écart constaté : le tapis de départ se mettait
-- à jour, la mise en page non.
--
-- On ne peut pas simplement ajouter clock_layout au sondage : cette
-- colonne pèse ~884 kB (les images du fond y sont embarquées en base64)
-- et le thème du club 1241 kB. Les relire toutes les 5 secondes sur
-- chaque écran de la salle représenterait des centaines de Mo par heure.
--
-- Supabase Realtime n'est pas une option non plus ici : l'état de
-- l'horloge est écrit dans `tournaments` toutes les 5 secondes, et chaque
-- UPDATE diffuserait la ligne entière — donc les 884 kB — à tous les
-- clients connectés.
--
-- Solution : une empreinte de 32 octets, calculée par Postgres lui-même.
-- L'application sonde l'empreinte et ne relit la donnée complète que
-- lorsqu'elle a réellement changé.
--
-- Vérifié en base avant déploiement :
--   * réécrire clock_seconds_left / clock_level_index / clock_updated_at
--     (ce que fait l'horloge toutes les 5 s) laisse l'empreinte
--     strictement identique — sinon chaque écran aurait rechargé 884 kB
--     en boucle ;
--   * changer la largeur d'un panneau change bien l'empreinte ;
--   * restaurer la disposition d'origine restaure l'empreinte d'origine.
--
-- Colonnes GENERATED : Postgres les recalcule à chaque écriture, il n'y a
-- rien à maintenir côté application et elles ne peuvent pas se
-- désynchroniser de la donnée qu'elles résument.

alter table tournaments
  add column if not exists clock_layout_fingerprint text
  generated always as (
    md5(coalesce(clock_layout::text, '') || '|' || coalesce(clock_background::text, ''))
  ) stored;

alter table club_settings
  add column if not exists theme_fingerprint text
  generated always as (md5(coalesce(theme::text, ''))) stored;

-- PostgREST met son schéma en cache : sans ça les nouvelles colonnes ne
-- sont pas exposées à l'API tout de suite.
notify pgrst, 'reload schema';
