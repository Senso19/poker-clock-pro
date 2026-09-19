import { supabase } from "./supabase.js";
import { chargerAvatars, avatarDe } from "./avatarsCache.js";

/**
 * chat.js — chat en direct du club, persistant en base (table
 * chat_messages), rafraîchi par sondage court côté client.
 *
 * `avatar_data` est absente des colonnes lues volontairement. Chaque ligne
 * en stocke une copie (~58 ko de base64), si bien que 200 messages illustrés
 * pesaient 9,6 Mo — redemandés toutes les trois secondes tant que le chat
 * restait à l'écran. La photo vient désormais du cache partagé, résolue par
 * compte : une fois par auteur, pas une fois par message.
 */
const COLONNES = "id, account_id, pseudo, body, created_at";

export async function fetchMessages(limit = 200) {
  // Tri du plus RÉCENT, puis remise à l'endroit. Trier du plus ancien puis
  // couper à `limit` gardait les 200 messages les plus VIEUX : passé ce
  // seuil le chat se figeait sur ses débuts et aucun message nouveau
  // n'apparaissait plus.
  const { data, error } = await supabase
    .from("chat_messages")
    .select(COLONNES)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const lignes = (data || []).reverse();
  await chargerAvatars(lignes.map((m) => m.account_id));
  return lignes.map((m) => ({ ...m, avatar_data: avatarDe(m.account_id) }));
}

/**
 * Sonde légère : « quelque chose a-t-il changé ? ».
 *
 * Le chat vit dans la barre latérale, donc affiché en permanence, et il se
 * relit toutes les trois secondes. Recharger les 200 messages à chaque fois
 * coûtait 26 ko par écran et par sondage — alors que neuf fois sur dix rien
 * n'a bougé. Sur une soirée d'ouverture à trente personnes connectées, cela
 * représentait près d'un gigaoctet par heure.
 *
 * On demande donc d'abord deux valeurs : le nombre total de messages et la
 * date du plus récent. Le compte repère les suppressions, la date repère les
 * arrivées — une suppression suivie d'un envoi ne peut pas passer inaperçue.
 * Environ cent octets, contre vingt-six mille.
 */
export async function empreinteDuChat() {
  const { data, count, error } = await supabase
    .from("chat_messages")
    .select("created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return `${count ?? 0}|${data?.[0]?.created_at ?? ""}`;
}

export async function sendMessage({ accountId, pseudo, body }) {
  // Pas de copie de la photo : elle est lue sur le compte à l'affichage.
  // Un visiteur sans compte n'en a de toute façon aucune, seul son pseudo
  // est conservé.
  const { error } = await supabase.from("chat_messages").insert({
    account_id: accountId,
    pseudo,
    body,
  });
  if (error) throw error;
}

export async function deleteMessage(id) {
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error) throw error;
}
