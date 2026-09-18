-- « Mot de passe oublié » : le joueur demande, un administrateur agit.
--
-- L'application n'envoie aucun e-mail : un clic sur "Mot de passe oublié"
-- pose simplement une demande ici, qui apparaît dans la cloche de
-- notifications de l'administrateur. C'est lui qui pose le nouveau mot de
-- passe et le transmet au joueur. Aucune information n'est demandée au
-- joueur, donc rien à deviner pour prendre un compte.
--
-- Une seule demande en attente par compte : la colonne est écrasée, pas
-- empilée, et repassée à null une fois traitée.
alter table public.accounts
  add column if not exists password_reset_requested_at timestamptz,
  add column if not exists password_reset_at timestamptz;
