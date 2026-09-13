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
      validated: true,
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

export async function updateAccountRole(id, role) {
  const { error } = await supabase.from("accounts").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
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
};

export function canManageTournaments(role) {
  return role === "admin" || role === "tournament_director";
}

// Gestion des comptes (rôles, mots de passe, suppression) : réservée à
// l'administrateur, même le Tournament Director n'y a pas accès.
export function canManageAccounts(role) {
  return role === "admin";
}

export function canControlClock(role) {
  return role === "admin" || role === "tournament_director" || role === "floor";
}

export function canEliminateAnyone(role) {
  return role === "admin" || role === "tournament_director" || role === "floor";
}
