import { useState } from "react";
import { signup, login, demanderReinitialisationMotDePasse } from "../lib/auth.js";
import { useAccount } from "../context/AccountContext.jsx";
import AvatarCropper from "./AvatarCropper.jsx";

/**
 * AuthScreen — connexion ou création de compte (avec code secret admin).
 * Affiché tant qu'aucun compte n'est connecté.
 */
export default function AuthScreen() {
  const { refresh } = useAccount();
  const [mode, setMode] = useState("login"); // login | signup | oubli

  const sousTitre = {
    login: "Connecte-toi à ton compte",
    signup: "Crée ton compte joueur",
    oubli: "Demander un nouveau mot de passe",
  };

  return (
    <div className="min-h-screen w-full bg-felt-bg font-body text-felt-cream flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="font-display text-2xl text-center mb-1">19PokerClub</div>
        <div className="text-center text-felt-cream/50 text-sm mb-6">{sousTitre[mode]}</div>

        {mode === "login" && <LoginForm onSuccess={refresh} onForgot={() => setMode("oubli")} />}
        {mode === "signup" && <SignupForm onSuccess={refresh} />}
        {mode === "oubli" && <ForgotPasswordForm onDone={() => setMode("login")} />}

        {mode !== "oubli" && (
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-center text-sm text-felt-cream/50 hover:text-felt-cream mt-4"
          >
            {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ForgotPasswordForm — le joueur demande, un administrateur agit.
 *
 * L'application n'envoie aucun e-mail : la demande arrive dans la cloche
 * de notifications du club, un administrateur pose le nouveau mot de
 * passe et le transmet au joueur. Rien n'est demandé au joueur ici, donc
 * rien à deviner pour s'emparer d'un compte.
 *
 * La confirmation est la même que le pseudo existe ou non : cette page ne
 * doit pas permettre de savoir qui est inscrit au club.
 */
function ForgotPasswordForm({ onDone }) {
  const [pseudo, setPseudo] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function envoyer() {
    if (!pseudo.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await demanderReinitialisationMotDePasse(pseudo);
      setEnvoye(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  if (envoye) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <div className="text-3xl">✉</div>
        <div className="text-sm text-felt-cream/70">
          Ta demande est partie au 19PokerClub. Un administrateur va te poser un nouveau mot de passe et te le
          transmettre.
        </div>
        <button onClick={onDone} className="px-4 py-3 bg-felt-gold text-felt-bg rounded-md font-display">
          Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-felt-cream/50">
        Indique ton pseudo : un administrateur du club recevra la demande, changera ton mot de passe et te le
        communiquera.
      </div>
      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && envoyer()}
        placeholder="Pseudo"
        autoFocus
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      {error && <div className="text-felt-alert text-sm">{error}</div>}
      <button
        onClick={envoyer}
        disabled={loading || !pseudo.trim()}
        className="px-4 py-3 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
      >
        {loading ? "Envoi…" : "Envoyer la demande"}
      </button>
      <button onClick={onDone} className="w-full text-center text-sm text-felt-cream/50 hover:text-felt-cream">
        Retour à la connexion
      </button>
    </div>
  );
}

function LoginForm({ onSuccess, onForgot }) {
  const [pseudo, setPseudo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!pseudo.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(pseudo, password);
      onSuccess();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder="Pseudo"
        autoFocus
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        type="password"
        placeholder="Mot de passe"
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      {error && <div className="text-felt-alert text-sm">{error}</div>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-3 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <button onClick={onForgot} className="text-center text-sm text-felt-cream/50 hover:text-felt-cream">
        Mot de passe oublié ?
      </button>
    </div>
  );
}

function SignupForm({ onSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [avatarData, setAvatarData] = useState(null);
  const [croppingFile, setCroppingFile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCroppingFile(file);
    e.target.value = "";
  }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !pseudo.trim() || !password) {
      setError("Merci de remplir tous les champs obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pseudo: pseudo.trim(),
        email: email.trim(),
        password,
        avatarData,
        code,
      });
      try {
        sessionStorage.setItem("pcp_just_signed_up", "1");
      } catch {
        /* ignore */
      }
      onSuccess();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Prénom"
          className="flex-1 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Nom"
          className="flex-1 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />
      </div>
      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder="Pseudo (visible dans les tournois)"
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optionnel)"
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Mot de passe"
        className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
      />
      <label className="text-xs text-felt-cream/50">
        Avatar (optionnel)
        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="block w-full mt-1 text-xs text-felt-cream/60"
        />
      </label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Code secret du club (sauf 1er compte)"
        className="bg-felt-panel border border-felt-gold/30 rounded-md px-3 py-2 text-felt-cream uppercase tracking-widest font-mono placeholder:text-felt-cream/40 placeholder:normal-case placeholder:tracking-normal placeholder:font-body placeholder:text-xs"
      />
      {error && <div className="text-felt-alert text-sm">{error}</div>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-3 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
      >
        {loading ? "Création…" : "Créer mon compte"}
      </button>
      {croppingFile && (
        <AvatarCropper
          file={croppingFile}
          onConfirm={(dataUrl) => {
            setAvatarData(dataUrl);
            setCroppingFile(null);
          }}
          onCancel={() => setCroppingFile(null)}
        />
      )}
    </div>
  );
}
