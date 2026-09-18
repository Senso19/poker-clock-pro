-- Fin explicite d'un championnat.
--
-- Jusqu'ici, "terminé" était déduit : plus aucune étape à venir. Un
-- championnat dont on n'a pas encore programmé la prochaine étape passait
-- donc pour fini, et rien ne permettait de le clore volontairement. Cette
-- date, quand elle est posée, fait foi.
alter table public.championships add column if not exists finished_at timestamptz;
