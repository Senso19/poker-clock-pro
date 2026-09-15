import { supabase } from "./supabase.js";

/**
 * auth.js — comptes joueurs avec rôles (admin, tournament_director, floor,
 * table_captain, player). Validation par code secret défini par l'admin
 * (club_settings.registration_code). Protection au niveau app (comme les
 * autres outils internes du club) : pas de hash de mot de passe, pas de
 * vraie sécurité serveur — suffisant pour un usage interne en club.
 */

const SESSION_KEY = "pcp_account_id";

export function getStoredAccountId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeAccountId(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchAccountById(id) {
  const { data, error } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function signup({ firstName, lastName, pseudo, email, password, avatarData, code }) {
  const { count } = await supabase.from("accounts").select("*", { count: "exact", head: true });
  const isFirstAccount = (count || 0) === 0;

  if (!isFirstAccount) {
    const { data: settings } = await supabase.from("club_settings").select("registration_code").limit(1).maybeSingle();
    const validCode =
      !!settings?.registration_code &&
      settings.registration_code.trim().toUpperCase() === (code || "").trim().toUpperCase();
    if (!validCode) throw new Error("Code secret incorrect.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      pseudo,
      email: email || null,
      password,
      avatar_data: avatarData || null,
      role: isFirstAccount ? "admin" : "player",
      // Seul ce tout premier compte (fondateur du club) est verrouillé en
      // tant qu'admin de façon permanente (voir updateAccountRole) ; les
      // admins promus ensuite restent librement rétrogradables par lui.
      is_owner: isFirstAccount,
      // Le tout premier compte (admin fondateur) est validé d'office ; tous
      // les suivants attendent la validation d'un admin/TD avant de pouvoir
      // s'inscrire à un tournoi (voir canParticipate).
      validated: isFirstAccount,
    })
    .select()
    .single();
  if (error) {
    if (error.message?.includes("duplicate")) throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  storeAccountId(data.id);
  return data;
}

export async function login(pseudo, password) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .ilike("pseudo", pseudo.trim())
    .maybeSingle();
  if (error) throw error;
  if (!data || data.password !== password) throw new Error("Pseudo ou mot de passe incorrect.");
  storeAccountId(data.id);
  return data;
}

export function logout() {
  storeAccountId(null);
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
  const { error } = await supabase.from("accounts").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

// Création d'un compte directement par l'admin (depuis "Gérer les
// membres") : validé d'office, contrairement à une inscription publique.
export async function adminCreateAccount({ pseudo, firstName, lastName, email, password, role, avatarData }) {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      pseudo,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      password,
      role: role || "player",
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
  const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
  const payload = { club_name: "19PokerClub", registration_code: code };
  const { error } = existing
    ? await supabase.from("club_settings").update(payload).eq("id", existing.id)
    : await supabase.from("club_settings").insert(payload);
  if (error) throw error;
}

export async function setChatSettings(maxLength, cooldownSeconds) {
  const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
  const payload = {
    club_name: "19PokerClub",
    chat_max_length: Math.max(1, Number(maxLength) || 200),
    chat_cooldown_seconds: Math.max(0, Number(cooldownSeconds) || 0),
  };
  const { error } = existing
    ? await supabase.from("club_settings").update(payload).eq("id", existing.id)
    : await supabase.from("club_settings").insert(payload);
  if (error) throw error;
}

// Message live diffusé sur le panneau "Annonces" de l'horloge (texte libre,
// modifiable par l'admin/TD/floor depuis le panneau lui-même).
export async function setLiveAnnouncement(text) {
  const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
  const payload = {
    club_name: "19PokerClub",
    live_announcement: text || null,
    live_announcement_updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("club_settings").update(payload).eq("id", existing.id)
    : await supabase.from("club_settings").insert(payload);
  if (error) throw error;
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
  player: "Joueur",
  invite: "Invité",
};

// Droits par défaut (comportement d'origine, avant que l'admin ne
// personnalise la matrice). "invite" a les mêmes droits que "player".
const DEFAULT_ROLE_PERMISSIONS = {
  admin: { manageTournaments: true, manageAccounts: true, controlClock: true, eliminateAnyone: true },
  tournament_director: { manageTournaments: true, manageAccounts: false, controlClock: true, eliminateAnyone: true },
  floor: { manageTournaments: false, manageAccounts: false, controlClock: true, eliminateAnyone: true },
  table_captain: { manageTournaments: false, manageAccounts: false, controlClock: false, eliminateAnyone: false },
  player: { manageTournaments: false, manageAccounts: false, controlClock: false, eliminateAnyone: false },
  invite: { manageTournaments: false, manageAccounts: false, controlClock: false, eliminateAnyone: false },
};

export const PERMISSION_LABELS = {
  manageTournaments: "Gérer les tournois",
  manageAccounts: "Gérer les membres et les droits",
  controlClock: "Contrôler l'horloge",
  eliminateAnyone: "Éliminer n'importe quel joueur",
};

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

export function canEliminateAnyone(role) {
  return hasPermission(role, "eliminateAnyone");
}

export { DEFAULT_ROLE_PERMISSIONS };

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
