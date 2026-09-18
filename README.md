# PokerClock Pro — 19PokerClub

Gestionnaire de tournoi poker complet (remplaçant BlindValet), avec import/export
Excel/Sheets, impression de tickets, et interface personnalisable.

Stack : React (Vite) + Tailwind + Supabase + Vercel — même pattern que tes autres
apps (RLS désactivée, protection par mot de passe côté app, déploiement auto
GitHub → Vercel).

## Modules (V1 complète)

1. **Tournament Clock** (`src/components/EditableClock.jsx`, `MobileClockView.jsx`)
   Horloge de niveaux (SB/BB/ante), pause/lecture, son de fin de niveau,
   passage auto au niveau suivant, mode plein écran / écran de diffusion.

2. **Structure Editor** (`src/components/StructureEditor.jsx`)
   Édition des niveaux de blinds (ajout/suppression/réordonnancement),
   modèles de structure réutilisables (turbo, standard, deepstack), sauvegarde
   Supabase par tournoi.

3. **Player Manager** (`src/components/PlayerManager.jsx`)
   Inscriptions, rebuys, add-ons, éliminations, classement en direct,
   répartition des tables (table balancing).

4. **Prizepool & Payouts** (calculé dans `src/lib/points.js`)
   Calcul automatique du prizepool (buy-ins + rebuys + add-ons - rake),
   répartition par palier configurable, gestion bounties optionnelle.

5. **Excel / Google Sheets Sync** (`src/components/SheetsSync.jsx`)
   - Import joueurs depuis .xlsx/.csv (SheetJS, en local, pas de backend requis)
   - Export résultats vers .xlsx
   - Sync optionnelle vers Google Sheets via un endpoint Google Apps Script
     (même pattern que tes autres projets — webhook/URL configurable)

6. **Ticket Printing** (`src/components/TicketPrint.jsx`)
   Tickets d'inscription / rebuy / add-on au format imprimable (A6/A7),
   générés en HTML + `window.print()`, avec QR code optionnel (numéro de
   joueur / siège).

7. **Theme & Layout Settings** (`src/context/ThemeContext.jsx`,
   `src/components/LayoutSettings.jsx`)
   Fond personnalisable (couleur/image), disposition des panneaux
   (clock / joueurs / classement) en grille libre, mode "écran spectateur"
   séparé du mode "admin".

## Base de données (Supabase)

Voir `supabase/schema.sql`. Tables : `tournaments`, `blind_levels`,
`players`, `registrations`, `eliminations`, `club_settings`.

## Déploiement

Identique à tes autres apps :
1. `npm install` puis `npm run dev` pour tester en local
2. Créer un projet Supabase, exécuter `supabase/schema.sql`
3. Renseigner `.env` (URL + clé anon Supabase)
4. Push GitHub → connecter à Vercel (auto-deploy)
5. Mot de passe app-level dans `src/context/AuthContext.jsx`

## Prochaines étapes

Ce scaffold contient la structure complète + le module Clock fonctionnel
(le cœur du réacteur). Les autres modules sont en stubs avec la logique
prévue en commentaire — on les construit un par un dans les prochains
échanges, dans l'ordre que tu préfères.
