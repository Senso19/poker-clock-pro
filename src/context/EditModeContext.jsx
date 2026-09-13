import { createContext, useContext, useState } from "react";

/**
 * EditModeContext — mode "personnalisation" global, activable uniquement
 * par l'admin via un petit bouton flottant. Quand actif, les tableaux
 * enveloppés dans <CustomizablePanel> affichent leur icône de réglages.
 */
const EditModeContext = createContext({ isEditMode: false, setIsEditMode: () => {} });

export function EditModeProvider({ children }) {
  const [isEditMode, setIsEditMode] = useState(false);
  return <EditModeContext.Provider value={{ isEditMode, setIsEditMode }}>{children}</EditModeContext.Provider>;
}

export function useEditMode() {
  return useContext(EditModeContext);
}
