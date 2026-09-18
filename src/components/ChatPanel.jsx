import { useEffect, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling.js";
import ClubLoader from "./ClubLoader.jsx";
import { useAccount } from "../context/AccountContext.jsx";
import { fetchMessages, sendMessage, deleteMessage } from "../lib/chat.js";
import { fetchClubSettings } from "../lib/auth.js";
import { useConfirm } from "../context/ConfirmContext.jsx";
import EditableButton from "./EditableButton.jsx";

const DEFAULT_MAX_LENGTH = 200;

/**
 * ChatPanel — chat en direct du club, réutilisable (fenêtre modale depuis la
 * sidebar ET affichage intégré dans l'onglet "Paramètres du club"). Charge
 * ses propres réglages (longueur max, délai entre messages) depuis
 * club_settings. L'administrateur peut supprimer un message précis (icône
 * 🗑 au survol) ; les autres rôles ne le peuvent pas.
 */
export default function ChatPanel() {
  const confirmAction = useConfirm();
  const { account } = useAccount();
  const isAdmin = account.role === "admin";
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [maxLength, setMaxLength] = useState(DEFAULT_MAX_LENGTH);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [, setTick] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchClubSettings()
      .then((s) => {
        setMaxLength(s?.chat_max_length || DEFAULT_MAX_LENGTH);
        setCooldownSeconds(s?.chat_cooldown_seconds || 0);
      })
      .catch(() => {});
  }, []);

  // Le panneau vit dans la barre latérale : il est monté en permanence,
  // même quand la barre est repliée ou qu'on est sur un autre écran. Il
  // sondait donc les messages toutes les 3 secondes en continu — 26 800
  // lectures relevées sur une table vide. On ne sonde que lorsqu'il est
  // réellement visible à l'écran.
  const [visible, setVisible] = useState(false);
  const zoneRef = useRef(null);
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  usePolling(load, 3000, { actif: visible });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Force un nouveau rendu chaque seconde pour que le compte à rebours du
  // délai entre messages s'affiche en direct, sans attendre le prochain
  // sondage des messages.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      setMessages(await fetchMessages());
    } catch {
      // silencieux
    }
    setLoading(false);
  }

  function remainingCooldown() {
    if (!cooldownSeconds) return 0;
    const mine = [...messages].reverse().find((m) => m.account_id === account.id);
    if (!mine) return 0;
    const elapsed = (Date.now() - new Date(mine.created_at).getTime()) / 1000;
    return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
  }

  async function handleSend() {
    const body = text.trim().slice(0, maxLength);
    if (!body || remainingCooldown() > 0) return;
    setSending(true);
    setText("");
    try {
      await sendMessage({ accountId: account.id, pseudo: account.pseudo, avatarData: account.avatar_data, body });
      await load();
    } catch {
      // silencieux
    }
    setSending(false);
  }

  async function handleDelete(id) {
    if (!(await confirmAction("Supprimer ce message ?"))) return;
    setDeletingId(id);
    try {
      await deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silencieux
    }
    setDeletingId(null);
  }

  const blockedFor = remainingCooldown();

  return (
    <div ref={zoneRef} className="flex flex-col h-full min-h-0 font-body text-felt-cream">
      <div className="flex-1 min-h-0 overflow-y-auto px-1 py-2 space-y-3">
        {loading ? (
          <ClubLoader size={44} label={null} />
        ) : messages.length === 0 ? (
          <div className="text-felt-cream/40 text-sm">Aucun message pour le moment. Lance la discussion !</div>
        ) : (
          messages.map((m) => {
            const mine = m.account_id === account.id;
            return (
              <div key={m.id} className={`group flex gap-2 items-start ${mine ? "flex-row-reverse" : ""}`}>
                {m.avatar_data ? (
                  <img src={m.avatar_data} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-felt-bg flex items-center justify-center text-xs text-felt-cream/50 shrink-0">
                    {m.pseudo?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                  <div className="text-[11px] text-felt-cream/40 mb-0.5">{m.pseudo}</div>
                  <div className={`inline-block px-3 py-1.5 rounded-lg text-sm break-words ${mine ? "bg-felt-gold text-felt-bg" : "bg-felt-bg text-felt-cream"}`}>
                    {m.body}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    title="Supprimer ce message"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-felt-alert/60 hover:text-felt-alert text-xs shrink-0 mt-1 disabled:opacity-40"
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-felt-cream/10 pt-2 mt-1 shrink-0">
        <div className="flex flex-col gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, maxLength))}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Écrire un message…"
            maxLength={maxLength}
            className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
          />
          <EditableButton
            groupKey="chat-panel"
            id="send"
            wrapperClassName="w-full"
            onClick={handleSend}
            disabled={sending || !text.trim() || blockedFor > 0}
            className="w-full px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40 whitespace-nowrap"
          >
            {blockedFor > 0 ? `${blockedFor}s` : "Envoyer"}
          </EditableButton>
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px] text-felt-cream/30">
          <span>{blockedFor > 0 ? `Attends ${blockedFor}s avant de renvoyer un message` : ""}</span>
          <span>{text.length}/{maxLength}</span>
        </div>
      </div>
    </div>
  );
}
