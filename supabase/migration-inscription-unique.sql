-- Un joueur ne peut être inscrit qu'une seule fois au même tournoi
-- ------------------------------------------------------------------
-- Le contrôle existe désormais dans l'application, sur les quatre voies
-- d'inscription (ajout d'un membre, ajout d'un nouveau nom, import de
-- fichier, copié-collé) ainsi que sur l'auto-inscription depuis la grille
-- des tournois. Cet index est la garantie de dernier recours : il couvre
-- aussi les voies qui n'existent pas encore, et les inscriptions
-- simultanées depuis deux appareils, qu'un contrôle applicatif ne peut pas
-- attraper (les deux lisent "pas encore inscrit" avant que l'un écrive).
--
-- Index partiel : player_id peut être NULL, et deux NULL ne sont pas
-- considérés égaux par un index unique — la clause WHERE rend l'intention
-- explicite plutôt que de s'en remettre à ce comportement.
--
-- Appliquée le 2026-09-18 sur le projet 19PokerClub, après résolution du
-- seul doublon existant (Bigboules, "Championnat Eté - Etape 3").
--
-- ATTENTION : cette migration ÉCHOUE s'il reste des doublons. C'est
-- voulu — on ne supprime pas silencieusement l'inscription d'un joueur
-- dans un tournoi en cours. Pour les repérer d'abord :
--
--   select t.name, p.full_name, count(*), array_agg(r.id)
--     from registrations r
--     join tournaments t on t.id = r.tournament_id
--     left join players p on p.id = r.player_id
--    where r.player_id is not null
--    group by t.name, p.full_name, r.tournament_id, r.player_id
--   having count(*) > 1;
--
-- Puis, pour chaque cas, décider laquelle des lignes garder (celle dont le
-- siège correspond à la place réellement occupée), rattacher son compte à
-- celle-là si besoin, et supprimer l'autre.

create unique index if not exists registrations_tournoi_joueur_unique
  on registrations (tournament_id, player_id)
  where player_id is not null;
