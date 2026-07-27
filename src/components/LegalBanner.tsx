/**
 * LegalBanner — Avertissement légal obligatoire (§3 de la SPEC).
 *
 * ⚠️ NON MASQUABLE, NON RETIRABLE.
 * Présent sur toutes les routes, z-index maximal.
 * Toute PR qui supprime ou affaiblit ce composant est REJETÉE.
 */

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export default function LegalBanner() {
  const [visible, setVisible] = useState(true);

  // Forcer la visibilité : même si un malandrin tente de cacher le bandeau
  // via une classe CSS ou un style injecté, le useEffect le ramène.
  useEffect(() => {
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="relative z-[9999] w-full bg-destructive/10 dark:bg-destructive/20 border-b border-destructive/20"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 text-xs sm:text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive sm:h-5 sm:w-5" />
        <p className="leading-tight text-foreground/90">
          <strong className="text-destructive">Outil expérimental</strong> à
          visée informative et pédagogique. Les détections satellite sont des{" "}
          <strong>anomalies thermiques</strong>, pas des incendies confirmés.
          <strong className="ml-1">
            Ne jamais utiliser pour une décision opérationnelle ou de sécurité.
          </strong>
        </p>
      </div>
      <div className="border-t border-destructive/10 px-4 py-1 text-[10px] text-muted-foreground/70 sm:text-xs">
        <span className="mx-auto flex max-w-7xl gap-x-2">
          <span>
            <strong>En cas d&apos;incendie : 18 / 112</strong>
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            Sources officielles : SDIS 33 · Préfecture de la Gironde ·
            Météo-France (Météo des Forêts)
          </span>
        </span>
      </div>
    </div>
  );
}
