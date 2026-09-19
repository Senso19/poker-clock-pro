import { supabase } from "./supabase.js";
import { upsertClubSettings } from "./clubSettings.js";

/**
 * auth.js — comptes joueurs avec rôles (admin, tournament_director, floor,
 * table_captain, player). Validation par code secret défini par l'admin
 * (club_settings.registration_code).
 *
 * L'authentification est celle de Supabase : chaque compte a une identité
 * réelle, son mot de passe est haché et ne quitte jamais le serveur. La
 * session ouverte porte un jeton, et ce jeton est ce qui permettra aux
 * règles de sécurité de la base de savoir QUI demande — l'ancienne version
 * comparait le mot de passe dans le navigateur et la base ne voyait qu'un
 * anonyme, toujours le même.
 *
 * On se connecte toujours avec son PSEUDO : l'adresse d'authentification
 * en est dérivée ici même, sans jamais interroger la base, pour qu'aucune
 * correspondance pseudo → e-mail ne soit exposée. Les vrais e-mails des
 * membres restent dans accounts.email, pour les notifications.
 */

const SESSION_KEY = "pcp_account_id";

// Doit rester identique à public.email_auth_du_pseudo() en base : les deux
// calculent l'adresse du même compte, chacune de son côté.
const DOMAINE_AUTH = "@membres.19pokerclub.fr";

export function emailAuthDuPseudo(pseudo) {
  return String(pseudo || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() + DOMAINE_AUTH;
}

function storeAccountId(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Inscription publique.
 *
 * Tout se passe en base, dans inscrire_compte() : un visiteur sans compte
 * n'a évidemment pas le droit d'écrire dans `accounts`, et il ne l'aura pas.
 *
 * Le code secret du club y est vérifié aussi. Il l'était auparavant dans le
 * navigateur, où il suffisait d'ouvrir la console pour s'en passer — le
 * déplacer côté serveur est un gain, pas seulement un contournement de la
 * règle d'écriture.
 *
 * Le rôle, la validation et le statut de fondateur sont décidés là-bas
 * également : c'est la base qui sait si le club a déjà un premier compte.
 */
export async function signup({ firstName, lastName, pseudo, email, password, avatarData, code }) {
  const { error } = await supabase.rpc("inscrire_compte", {
    p_pseudo: pseudo,
    p_prenom: firstName,
    p_nom: lastName,
    p_email: email || null,
    p_mot_de_passe: password,
    p_avatar: avatarData || null,
    p_code: code || null,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
  // L'identité Supabase vient d'être créée par le déclencheur : on enchaîne
  // sur une vraie connexion, pour que le nouvel inscrit reparte avec une
  // session comme les autres.
  return await login(pseudo, password);
}

export async function fetchAccountByAuthUserId(authUserId) {
  const { data } = await supabase.from("accounts").select("*").eq("auth_user_id", authUserId).maybeSingle();
  return data || null;
}

/**
 * Connexion par pseudo.
 *
 * Une seule voie : Supabase Auth, qui ouvre une vraie session. Son jeton
 * est ce qui permet aux règles de sécurité de la base de savoir qui
 * demande — sans lui, on n'est qu'un visiteur aux yeux du serveur, quels
 * que soient les boutons affichés à l'écran.
 *
 * Une voie de secours a existé le temps de la bascule, puis a été retirée
 * avec la RPC qui la servait : une connexion sans jeton laissait croire à
 * un membre qu'il était entré alors que la base l'aurait traité en
 * visiteur, et ce demi-état est pire qu'un refus franc.
 */
export async function login(pseudo, password) {
  const { data: session, error: erreurAuth } = await supabase.auth.signInWithPassword({
    email: emailAuthDuPseudo(pseudo),
    password,
  });
  if (erreurAuth || !session?.user) throw new Error("Pseudo ou mot de passe incorrect.");
  const compte = await fetchAccountByAuthUserId(session.user.id);
  if (!compte) {
    // Session ouverte mais aucun compte en face : on ne la laisse pas traîner.
    await supabase.auth.signOut();
    throw new Error("Pseudo ou mot de passe incorrect.");
  }
  storeAccountId(null); // plus aucune session locale : c'est le jeton qui fait foi
  return compte;
}

/**
 * Le compte du visiteur au chargement de la page, d'après la seule session
 * Supabase. Une ancienne session locale n'est plus acceptée : elle ne porte
 * aucun jeton, et la base ne verrait qu'un visiteur — mieux vaut demander
 * une vraie connexion que d'afficher des commandes qui ne répondront pas.
 */
export async function fetchSessionAccount() {
  try {
    const { data } = await supabase.auth.getSession();
    const authUserId = data?.session?.user?.id;
    if (!authUserId) return null;
    return await fetchAccountByAuthUserId(authUserId);
  } catch {
    return null;
  }
}

/**
 * Prévient à chaque changement de session : connexion, déconnexion, et
 * surtout PERTE de session.
 *
 * Le jeton expire au bout d'une heure. Le client le renouvelle tout seul,
 * mais un renouvellement peut échouer — réseau coupé dans la salle, machine
 * en veille toute une nuit sur un tournoi de plusieurs jours. Sans cette
 * écoute, la session tombait en silence : l'écran gardait ses boutons, la
 * base ne voyait plus qu'un visiteur, et les gestes de la soirée ne
 * partaient plus sans qu'aucun message ne l'indique.
 *
 * Rend une fonction pour arrêter d'écouter.
 */
export function surChangementDeSession(quand) {
  // Sans client d'authentification (bancs d'essai, rendu hors navigateur),
  // il n'y a pas de session à surveiller : on ne fait rien plutôt que de
  // faire tomber toute l'application au montage.
  if (typeof supabase.auth?.onAuthStateChange !== "function") return () => {};
  const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
    // INITIAL_SESSION double le chargement initial, déjà fait par ailleurs.
    if (evenement === "INITIAL_SESSION") return;
    quand(session?.user?.id ?? null, evenement);
  });
  return () => data?.subscription?.unsubscribe();
}

/**
 * « Mot de passe oublié » : le joueur demande, l'administrateur agit.
 *
 * On ne dit JAMAIS si le pseudo existe — sinon cette page servirait à
 * savoir qui est inscrit au club. La fonction réussit silencieusement
 * dans tous les cas ; seul un pseudo réel pose une demande.
 *
 * Une seule demande en attente par compte : redemander ne fait que
 * rafraîchir la date, ça n'empile rien dans les notifications.
 */
export async function demanderReinitialisationMotDePasse(pseudo) {
  // En base : un visiteur non connecté n'a pas le droit d'écrire dans
  // `accounts`, et son UPDATE ne levait aucune erreur — il touchait zéro
  // ligne. La demande n'arrivait donc jamais à l'administrateur, sans que
  // rien ne le signale, puisque cette fonction est muette par conception.
  await supabase.rpc("demander_reinitialisation", { p_pseudo: (pseudo || "").trim() });
}

/** Les demandes en attente, les plus anciennes d'abord. */
export async function fetchPasswordResetRequests() {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, pseudo, first_name, last_name, email, password_reset_requested_at")
    .not("password_reset_requested_at", "is", null)
    .order("password_reset_requested_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * L'administrateur pose le nouveau mot de passe et clôt la demande. Il
 * reste à le transmettre au joueur — l'application n'envoie pas d'e-mail.
 */
export async function reinitialiserMotDePasse(accountId, nouveauMotDePasse) {
  if (!nouveauMotDePasse || nouveauMotDePasse.trim().length < 4) {
    throw new Error("Le mot de passe doit faire au moins 4 caractères.");
  }
  const { error } = await supabase
    .from("accounts")
    .update({
      password: nouveauMotDePasse.trim(),
      password_reset_at: new Date().toISOString(),
      password_reset_requested_at: null,
    })
    .eq("id", accountId);
  if (error) throw error;
}

/** Écarter une demande sans rien changer (joueur qui a retrouvé son mot de passe). */
export async function ignorerDemandeReinitialisation(accountId) {
  const { error } = await supabase
    .from("accounts")
    .update({ password_reset_requested_at: null })
    .eq("id", accountId);
  if (error) throw error;
}

export async function logout() {
  storeAccountId(null);
  try {
    await supabase.auth.signOut();
  } catch {
    // Une session déjà expirée côté serveur ne doit pas empêcher de sortir.
  }
}

export async function fetchAllAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Comptes en attente de validation (nouvelles inscriptions) : un admin/TD
// doit les valider avant que le joueur puisse s'inscrire à un tournoi.
export async function fetchPendingAccounts() {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("validated", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function approveAccount(id) {
  // Un nouveau membre validé obtient par défaut le rôle "joueur" (l'admin
  // peut ensuite le changer depuis Gérer les membres si besoin).
  const { error } = await supabase.from("accounts").update({ validated: true, role: "player" }).eq("id", id);
  if (error) throw error;
}

export async function rejectAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

// Un compte peut se connecter et consulter l'app dès sa création, mais ne
// peut s'inscrire à un tournoi (lui-même ou via un TD) qu'une fois validé.
export function canParticipate(account) {
  return account?.validated !== false;
}

// Messages "Contacter l'administrateur" : gérés directement dans l'app
// (pas d'envoi d'e-mail), consultés par l'admin/TD via la cloche.
export async function submitContactMessage({ accountId, firstName, lastName, description }) {
  const { error } = await supabase
    .from("contact_messages")
    .insert({ account_id: accountId || null, first_name: firstName, last_name: lastName, description });
  if (error) throw error;
}

export async function fetchContactMessages() {
  const { data, error } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function markContactMessageRead(id) {
  const { error } = await supabase.from("contact_messages").update({ status: "read" }).eq("id", id);
  if (error) throw error;
}

export async function deleteContactMessage(id) {
  const { error } = await supabase.from("contact_messages").delete().eq("id", id);
  if (error) throw error;
}

export async function updateAccountRole(id, role) {
  // Seul le compte fondateur du club (is_owner) a son rôle verrouillé : on
  // ne le change qu'en donnant le rôle admin à quelqu'un d'autre puis en
  // supprimant ce compte (voir mergeAccounts / deleteAccount), jamais en
  // rétrogradant en place. Les autres admins (promus ensuite) restent
  // librement modifiables.
  const { data: current } = await supabase.from("accounts").select("is_owner").eq("id", id).maybeSingle();
  if (current?.is_owner) throw new Error("Le rôle de ce compte ne peut pas être changé.");
  const payload = { role };
  // Un compte qui perd le rôle "gestionnaire de club" perd aussi son
  // affiliation de club (le club_name n'a de sens que pour ce rôle) ; s'il
  // le reprend ensuite, l'admin devra le renseigner à nouveau via
  // setAccountClubName.
  if (role !== "club_manager") payload.club_name = null;
  const { error } = await supabase.from("accounts").update(payload).eq("id", id);
  if (error) throw error;
}

// Nom du club affilié à un gestionnaire de club, fixé par l'administrateur
// (voir "Gérer les membres"). Ses membres créés ensuite via "Mon club"
// héritent automatiquement de ce nom.
export async function setAccountClubName(id, clubName) {
  const { error } = await supabase.from("accounts").update({ club_name: clubName?.trim() || null }).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

// Création d'un compte directement par l'admin (depuis "Gérer les
// membres") : validé d'office, contrairement à une inscription publique.
export async function adminCreateAccount({ pseudo, firstName, lastName, email, password, role, avatarData, clubName }) {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      pseudo,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      password,
      role: role || "player",
      club_name: role === "club_manager" ? clubName?.trim() || null : null,
      avatar_data: avatarData || null,
      validated: true,
    })
    .select()
    .single();
  if (error) {
    if (error.message?.includes("duplicate")) throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data;
}

export async function assignTableCaptain(tournamentId, tableNumber, accountId) {
  const { error } = await supabase
    .from("table_captain_assignments")
    .upsert({ tournament_id: tournamentId, table_number: tableNumber, account_id: accountId }, { onConflict: "tournament_id,table_number" });
  if (error) throw error;
}

export async function fetchTableCaptainAssignments(tournamentId) {
  const { data, error } = await supabase
    .from("table_captain_assignments")
    .select("*, accounts(pseudo)")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return data || [];
}

// Tables assignées à un compte "chef de table" pour un tournoi donné
export async function fetchMyTables(tournamentId, accountId) {
  const { data, error } = await supabase
    .from("table_captain_assignments")
    .select("table_number")
    .eq("tournament_id", tournamentId)
    .eq("account_id", accountId);
  if (error) throw error;
  return (data || []).map((r) => r.table_number);
}

export async function fetchClubSettings() {
  const { data, error } = await supabase.from("club_settings").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setRegistrationCode(code) {
  await upsertClubSettings({ registration_code: code });
}

export async function setChatSettings(maxLength, cooldownSeconds) {
  await upsertClubSettings({
    chat_max_length: Math.max(1, Number(maxLength) || 200),
    chat_cooldown_seconds: Math.max(0, Number(cooldownSeconds) || 0),
  });
}

/**
 * Adresse publique du site du club. Elle sert au QR code et à l'affiche
 * d'adhésion : c'est ce qu'on donne aux joueurs, et ça n'est pas
 * forcément l'adresse depuis laquelle l'admin travaille (aperçu de
 * déploiement, adresse locale, nom de domaine propre au club).
 */
export async function setSiteUrl(url) {
  await upsertClubSettings({ site_url: url || null });
}


export async function updateOwnProfile(id, { pseudo, firstName, lastName, email, avatarData }) {
  const payload = {
    pseudo,
    first_name: firstName,
    last_name: lastName,
    email: email || null,
  };
  if (avatarData !== undefined) payload.avatar_data = avatarData;
  const { data, error } = await supabase.from("accounts").update(payload).eq("id", id).select().single();
  if (error) {
    if (error.message?.includes("duplicate")) throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data;
}

// Édition complète d'un compte par l'administrateur (pseudo, nom, email,
// mot de passe, avatar). Le mot de passe n'est mis à jour que si fourni
// (chaîne non vide), pour ne pas l'écraser par erreur.
export async function adminUpdateAccount(id, { pseudo, firstName, lastName, email, avatarData, password }) {
  const payload = {
    pseudo,
    first_name: firstName,
    last_name: lastName,
    email: email || null,
  };
  if (avatarData !== undefined) payload.avatar_data = avatarData;
  if (password) payload.password = password;
  const { data, error } = await supabase.from("accounts").update(payload).eq("id", id).select().single();
  if (error) {
    if (error.message?.includes("duplicate")) throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data;
}

export const ROLE_LABELS = {
  admin: "Administrateur",
  tournament_director: "Tournament Director",
  floor: "Floor",
  table_captain: "Chef de table",
  club_manager: "Joueur interclub",
  player: "Membre",
  invite: "Invité",
  visitor: "Visiteur",
};

/**
 * Le rôle qui s'applique RÉELLEMENT à quelqu'un.
 *
 * Sans compte, ou avec un compte que l'administrateur n'a pas encore
 * confirmé, on est visiteur : créer un compte ne donne rien tant que
 * personne ne l'a validé.
 */
export function roleEffectif(account) {
  if (!account || account.validated === false) return "visitor";
  return account.role || "visitor";
}

/**
 * Le libellé affiché pour un compte. Le joueur interclub porte le nom de
 * son club — « Joueur Aurillac » dit qui il est, « Joueur interclub » non.
 */
export function roleLabel(account) {
  const role = roleEffectif(account);
  if (role === "club_manager" && account?.club_name) return `Joueur ${account.club_name}`;
  return ROLE_LABELS[role] || role;
}

// Droits par défaut (comportement d'origine, avant que l'admin ne
// personnalise la matrice). "invite" a les mêmes droits que "player".
// "club_manager" n'apparaît pas dans cette matrice générale (voir
// RolePermissionsMatrix) : ses droits sont volontairement tous à false ici
// et gérés à part, de façon toujours circonscrite aux tournois interclubs
// (voir canManageTournament / isClubManager ci-dessous), pour qu'aucune
// case de la matrice ne puisse accidentellement lui donner un droit global
// (créer des tournois, gérer tous les membres, etc.).
/**
 * Les droits, par domaine. Chacun est RÉELLEMENT appliqué quelque part —
 * une case qui ne commanderait rien serait pire qu'absente.
 */
export const PERMISSION_GROUPS = [
  {
    titre: "Consultation",
    cles: ["viewPublicTournaments", "viewAllTournaments", "viewInterclubTournaments", "viewPublicChampionships", "viewAllChampionships"],
  },
  { titre: "Communication", cles: ["useChat", "postChat", "contactAdmin"] },
  { titre: "Table et horloge", cles: ["controlClock", "eliminatePlayers", "eliminateAnyone", "manageSeating"] },
  {
    titre: "Gestion",
    cles: ["manageTournaments", "manageStructure", "manageChampionships", "manageTemplates", "manageRegistrations", "manageClubSettings", "manageAccounts"],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.cles);

// Les droits d'un rôle qui voit et fait tout sauf la gestion des comptes.
const ETAT_MAJOR = {
  viewPublicTournaments: true, viewAllTournaments: true, viewInterclubTournaments: true,
  viewPublicChampionships: true, viewAllChampionships: true,
  useChat: true, postChat: true, contactAdmin: true,
  controlClock: true, eliminatePlayers: true, eliminateAnyone: true, manageSeating: true,
  manageTournaments: true, manageStructure: true, manageChampionships: true,
  manageTemplates: true, manageRegistrations: true, manageClubSettings: true,
  manageAccounts: false,
};

// Ce que voit un membre du club : tout, mais il ne touche à rien.
const MEMBRE = {
  viewPublicTournaments: true, viewAllTournaments: true, viewInterclubTournaments: true,
  viewPublicChampionships: true, viewAllChampionships: true,
  useChat: true, postChat: true, contactAdmin: true,
  controlClock: false, eliminatePlayers: false, eliminateAnyone: false, manageSeating: false,
  manageTournaments: false, manageStructure: false, manageChampionships: false,
  manageTemplates: false, manageRegistrations: false, manageClubSettings: false,
  manageAccounts: false,
};

const DEFAULT_ROLE_PERMISSIONS = {
  admin: { ...ETAT_MAJOR, manageAccounts: true },
  tournament_director: { ...ETAT_MAJOR },
  // Le floor tient la salle : horloge, sièges, éliminations. Il ne crée ni
  // tournoi ni structure.
  floor: {
    ...MEMBRE,
    controlClock: true, eliminatePlayers: true, eliminateAnyone: true, manageSeating: true,
  },
  // Le chef de table n'élimine qu'à ses propres tables — c'est
  // précisément ce que « Éliminer n'importe quel joueur » décoché veut
  // dire (voir EliminationView).
  table_captain: { ...MEMBRE, eliminatePlayers: true, eliminateAnyone: false },
  // Le membre du club voit tous les tournois et tous les championnats,
  // publics ou non.
  player: { ...MEMBRE },
  // Le joueur d'un club invité voit, en plus des publics, les tournois
  // interclubs — ceux auxquels il peut prétendre — mais pas les tournois
  // internes du club, ni les championnats non publics.
  club_manager: {
    ...MEMBRE,
    viewAllTournaments: false, viewAllChampionships: false,
    viewInterclubTournaments: true, viewPublicChampionships: true,
  },
  // Compte confirmé, sans plus : les tournois et championnats publics.
  invite: {
    ...MEMBRE,
    viewAllTournaments: false, viewInterclubTournaments: false,
    viewAllChampionships: false, viewPublicChampionships: true,
  },
  // Quelqu'un qui a le lien du site, sans compte — ou dont le compte
  // attend encore sa confirmation. Les tournois publics, le chat et de
  // quoi joindre l'administrateur : rien d'autre, pas même les
  // championnats publics. Il peut écrire dans le chat, mais devra se
  // donner un pseudo (voir pseudoVisiteur ci-dessous).
  visitor: {
    ...MEMBRE,
    viewAllTournaments: false, viewInterclubTournaments: false,
    viewAllChampionships: false, viewPublicChampionships: false,
  },
};

export const PERMISSION_LABELS = {
  viewPublicTournaments: "Voir les tournois en accès public",
  viewAllTournaments: "Voir tous les tournois",
  viewInterclubTournaments: "Voir les tournois interclubs",
  viewPublicChampionships: "Voir les championnats publics",
  viewAllChampionships: "Voir tous les championnats",
  useChat: "Lire le chat du club",
  postChat: "Écrire dans le chat",
  contactAdmin: "Contacter l'administrateur",
  controlClock: "Contrôler l'horloge",
  eliminatePlayers: "Éliminer des joueurs",
  eliminateAnyone: "Éliminer n'importe quel joueur (pas seulement ses tables)",
  manageSeating: "Gérer les tables et les sièges",
  manageTournaments: "Créer et modifier les tournois",
  manageStructure: "Modifier la structure des blindes",
  manageChampionships: "Gérer les championnats",
  manageTemplates: "Gérer les modèles",
  manageRegistrations: "Gérer les inscriptions Festival et Open",
  manageClubSettings: "Modifier les paramètres du club",
  manageAccounts: "Gérer les membres et les droits",
};

/**
 * Les droits que la matrice montre mais ne commande pas.
 *
 * « Gérer les membres et les droits » est réservé à l'administrateur par
 * construction (canManageAccounts ne consulte pas la matrice) : s'il était
 * réglable, un rôle pourrait se retirer à lui-même l'accès à cette page et
 * plus personne ne pourrait revenir en arrière.
 *
 * La ligne reste visible — elle dit qui peut quoi — mais aucune case n'y
 * est cliquable. Une case qui ne commande rien serait pire qu'absente.
 */
export const PERMISSIONS_TOUJOURS_VERROUILLEES = ["manageAccounts"];
// Rempli de façon réactive par ThemeContext à chaque chargement du thème du
// club, pour que les fonctions can*() ci-dessous reflètent la matrice
// éditée par l'admin sans avoir à modifier chacun de leurs appels.
let rolePermissionsOverride = null;
export function setRolePermissionsOverride(perms) {
  rolePermissionsOverride = perms || null;
}

function hasPermission(role, key) {
  const overridden = rolePermissionsOverride?.[role]?.[key];
  if (overridden != null) return overridden;
  return DEFAULT_ROLE_PERMISSIONS[role]?.[key] ?? false;
}

export function canManageTournaments(role) {
  return hasPermission(role, "manageTournaments");
}

// Les tournois internes du club, en plus des publics.
// Les tournois que le club a marqués « Accès public ». Le socle : sans
// lui, l'onglet Tournois n'a plus rien à montrer et disparaît.
export function canViewPublicTournaments(role) {
  return hasPermission(role, "viewPublicTournaments");
}

// Les tournois internes du club, en plus des publics.
export function canViewAllTournaments(role) {
  return hasPermission(role, "viewAllTournaments");
}

// L'onglet Tournois n'a de sens que pour qui peut en voir au moins un.
export function canViewTournaments(role) {
  return canViewPublicTournaments(role) || canViewAllTournaments(role) || canViewInterclubTournaments(role);
}

// Les tournois marqués « interclub », ouverts aux clubs invités.
export function canViewInterclubTournaments(role) {
  return hasPermission(role, "viewInterclubTournaments");
}

export function canViewPublicChampionships(role) {
  return hasPermission(role, "viewPublicChampionships");
}

export function canViewAllChampionships(role) {
  return hasPermission(role, "viewAllChampionships");
}

// L'onglet Championnats n'a de sens que pour qui peut en voir au moins un.
export function canViewChampionships(role) {
  return canViewPublicChampionships(role) || canViewAllChampionships(role);
}

export function canUseChat(role) {
  return hasPermission(role, "useChat");
}

export function canPostChat(role) {
  return hasPermission(role, "postChat");
}

export function canManageSeating(role) {
  return hasPermission(role, "manageSeating");
}

export function canManageStructure(role) {
  return hasPermission(role, "manageStructure");
}

export function canManageChampionships(role) {
  return hasPermission(role, "manageChampionships");
}

export function canManageTemplates(role) {
  return hasPermission(role, "manageTemplates");
}

export function canManageRegistrations(role) {
  return hasPermission(role, "manageRegistrations");
}

export function canManageClubSettings(role) {
  return hasPermission(role, "manageClubSettings");
}

export function canContactAdmin(role) {
  return hasPermission(role, "contactAdmin");
}

// Gestion des comptes (rôles, mots de passe, suppression) : réservée à
// l'administrateur, même le Tournament Director n'y a pas accès. Non
// personnalisable via la matrice (verrouillé) pour éviter qu'un rôle se
// retire lui-même l'accès à cette page.
export function canManageAccounts(role) {
  return role === "admin";
}

export function canControlClock(role) {
  return hasPermission(role, "controlClock");
}

/**
 * Accéder à l'écran d'élimination. Distinct de « éliminer n'importe quel
 * joueur », qui n'en règle que la PORTÉE : le chef de table élimine, mais
 * seulement à ses tables.
 */
export function canEliminatePlayers(role) {
  return hasPermission(role, "eliminatePlayers");
}

export function canEliminateAnyone(role) {
  return hasPermission(role, "eliminateAnyone");
}

export { DEFAULT_ROLE_PERMISSIONS };

// --- Gestionnaire de club / tournois interclubs ---------------------------
//
// Un "gestionnaire de club" gère uniquement les tournois marqués "Tournoi
// interclubs" (tournaments.is_interclub) — jamais les tournois normaux du
// club, et il ne peut jamais en créer (la création reste réservée à
// l'administrateur, ou à qui a la permission globale manageTournaments,
// exactement comme avant). Il gère aussi son propre club : il peut y
// inscrire des membres (accounts.club_name = le nom de son club, fixé par
// l'admin) et les inscrire dans les tournois interclubs, dans la limite de
// MAX_CLUB_REGS_PER_INTERCLUB par tournoi.

export const MAX_CLUB_REGS_PER_INTERCLUB = 10;

export function isClubManager(role) {
  return role === "club_manager";
}

// Un "membre de club" est un compte affilié à un club externe (club_name
// renseigné) mais qui n'est pas lui-même le gestionnaire de ce club — il ne
// voit et ne participe qu'aux tournois interclubs, en lecture seule.
export function isClubMember(account) {
  return !!account?.club_name && !isClubManager(account?.role);
}

// Détermine si `account` peut gérer CE tournoi précis. Les rôles à
// permission globale (admin, TD, floor selon la matrice) gèrent tous les
// tournois comme avant ; le gestionnaire de club ne gère que les tournois
// interclubs, quel que soit le club organisateur.
export function canManageTournament(account, tournament) {
  if (!account) return false;
  if (canManageTournaments(account.role)) return true;
  return isClubManager(account.role) && !!tournament?.is_interclub;
}

// Gestion de son propre club (inscription de membres, etc.) — réservé au
// gestionnaire de club, distinct de canManageAccounts (admin, tous les
// membres du site).
export function canManageOwnClub(role) {
  return isClubManager(role);
}

// Membres d'un club donné (créés par son gestionnaire), pour "Mon club".
export async function fetchClubMembers(clubName) {
  if (!clubName) return [];
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("club_name", clubName)
    .neq("role", "club_manager")
    .order("pseudo", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Création d'un membre de club par son gestionnaire : toujours rôle
// "player", toujours affilié au club du gestionnaire, validé d'office.
export async function createClubMember(managerAccount, { pseudo, firstName, lastName, email, password, avatarData }) {
  if (!managerAccount?.club_name) throw new Error("Aucun club affilié à ce compte.");
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      pseudo,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      password,
      role: "player",
      club_name: managerAccount.club_name,
      avatar_data: avatarData || null,
      validated: true,
    })
    .select()
    .single();
  if (error) {
    if (error.message?.includes("duplicate")) throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data;
}

// Fusionne un compte "doublon" (mergeId) dans le compte à conserver
// (keepId) : toutes ses inscriptions, ses messages de chat et son rôle de
// chef de table sont réattribués au compte conservé (y compris son
// historique de points en championnat, puisqu'il repose sur le player_id
// des inscriptions). Le compte doublon est ensuite supprimé. Utile quand un
// joueur a perdu ses identifiants et recréé un compte.
export async function mergeAccounts(keepId, mergeId) {
  if (keepId === mergeId) throw new Error("Impossible de fusionner un compte avec lui-même.");

  const { data: keepAccount, error: keepErr } = await supabase.from("accounts").select("*").eq("id", keepId).single();
  if (keepErr) throw keepErr;
  const { data: mergeAccount, error: mergeErr } = await supabase.from("accounts").select("*").eq("id", mergeId).single();
  if (mergeErr) throw mergeErr;

  let { data: keepPlayer } = await supabase
    .from("players")
    .select("id")
    .ilike("full_name", keepAccount.pseudo)
    .maybeSingle();
  if (!keepPlayer) {
    const { data: created, error: createErr } = await supabase
      .from("players")
      .insert({ full_name: keepAccount.pseudo, email: keepAccount.email })
      .select()
      .single();
    if (createErr) throw createErr;
    keepPlayer = created;
  }

  const { error: regErr } = await supabase
    .from("registrations")
    .update({ account_id: keepId, player_id: keepPlayer.id })
    .eq("account_id", mergeId);
  if (regErr) throw regErr;

  const { data: oldPlayer } = await supabase.from("players").select("id").ilike("full_name", mergeAccount.pseudo).maybeSingle();
  if (oldPlayer && oldPlayer.id !== keepPlayer.id) {
    await supabase.from("registrations").update({ player_id: keepPlayer.id }).eq("player_id", oldPlayer.id);
  }

  await supabase.from("chat_messages").update({ account_id: keepId }).eq("account_id", mergeId);
  await supabase.from("table_captain_assignments").update({ account_id: keepId }).eq("account_id", mergeId);

  const { error: delErr } = await supabase.from("accounts").delete().eq("id", mergeId);
  if (delErr) throw delErr;
}
