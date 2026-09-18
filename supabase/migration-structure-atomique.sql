-- Remplacement de la structure de blinds en une seule transaction
-- ------------------------------------------------------------------
-- Appliquée le 2026-09-18 sur le projet 19PokerClub.
--
-- Côté application, enregistrer la structure faisait un DELETE puis un
-- INSERT en deux allers-retours. Entre les deux, la table est vide : une
-- coupure réseau à cet instant précis laisse le tournoi SANS structure.
--
-- Le risque restait théorique tant que l'enregistrement se faisait à la
-- main. Avec l'enregistrement automatique de l'éditeur, l'écriture se
-- produit à chaque pause de saisie — la fenêtre s'ouvre donc beaucoup plus
-- souvent, et pendant un tournoi en cours.
--
-- Dans une fonction, les deux ordres appartiennent à la même transaction :
-- soit la nouvelle structure remplace l'ancienne, soit rien ne bouge.
--
-- Vérifié sur les données réelles avant déploiement :
--   * un appel volontairement invalide (durée non numérique) échoue et
--     laisse les 17 niveaux du tournoi en cours intacts ;
--   * un aller-retour avec la forme JSON exacte envoyée par le client
--     restitue la structure à l'identique.

create or replace function remplacer_structure_blinds(p_tournament_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from blind_levels where tournament_id = p_tournament_id;

  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return;
  end if;

  -- Le tournoi vient du paramètre et non des lignes : impossible d'écrire
  -- dans un autre tournoi que celui qu'on efface.
  insert into blind_levels (tournament_id, position, small_blind, big_blind, ante,
                            duration_minutes, is_break, break_label)
  select p_tournament_id,
         (r ->> 'position')::int,
         (r ->> 'small_blind')::int,
         (r ->> 'big_blind')::int,
         (r ->> 'ante')::int,
         (r ->> 'duration_minutes')::int,
         (r ->> 'is_break')::boolean,
         r ->> 'break_label'
    from jsonb_array_elements(p_rows) as r;
end;
$$;

notify pgrst, 'reload schema';
