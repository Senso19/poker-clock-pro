import { useState } from "react";
import { signup, login } from "../lib/auth.js";
import { useAccount } from "../context/AccountContext.jsx";
import AvatarCropper from "./AvatarCropper.jsx";

/**
 * AuthScreen — connexion ou création de compte (avec code secret admin).
 * Affiché tant qu'aucun compte n'est connecté.
 */
export default function AuthScreen() {
  const { refresh } = useAccount();
  const [mode, setMode] = useState("login"); // login | signup

  return (
    <div className="min-h-screen w-full bg-felt-bg font-body text-felt-cream flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="font-display text-2xl text-center mb-1">19PokerClub</div>
        <div className="text-center text-felt-cream/50 text-sm mb-6">
          {mode === "login" ? "Connecte-toi à ton compte" : "Crée ton compte joueur"}
        </div>

        {mode === "login" ? (
          <LoginForm onSuccess={refresh} />
        ) : (
          <SignupForm onSuccess={refresh} />
        )}

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full text-center text-sm text-felt-cream/50 hover:text-felt-cream mt-4"
        >
          {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

function LoginForm({ onSuccess }) {
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
