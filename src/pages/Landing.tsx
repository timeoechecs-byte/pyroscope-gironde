/**
 * PyroScope 33 — Landing page.
 *
 * Thème : forêt / incendie / prévention.
 * Palette : vert sombre (pinède), ambre/rouge (alerte feu), crème (lisibilité).
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Eye,
  Flame,
  Map,
  Thermometer,
  Wind,
  Trees,
  Shield,
  Satellite,
  Grip,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: {
    transition: { staggerChildren: 0.1 },
  },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f1a0f] text-[#e8e0d8]">
      {/* ── Navigation ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#2a3a2a]/50 bg-[#0f1a0f]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-semibold tracking-tight">
              PyroScope
              <span className="text-amber-500">33</span>
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-[#a0b0a0] hover:text-[#e8e0d8]"
              onClick={() => navigate("/auth")}
            >
              Se connecter
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-500"
              onClick={() => navigate("/auth")}
            >
              Essayer
            </Button>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <motion.section
        className="relative overflow-hidden px-4 py-20 sm:py-32"
        initial="initial"
        animate="animate"
      >
        {/* Fond : gradient forêt → feu */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1a0f] via-[#1a2e1a] to-[#2a1a0f]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-700/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div
            variants={fadeIn}
            className="mb-6"
          >
            <Badge
              variant="outline"
              className="border-amber-700/40 text-amber-400"
            >
              ⚠️ Expérimental — Surveillance des forêts girondines
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeIn}
            className="text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Connaître le risque,
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-red-500 bg-clip-text text-transparent">
              protéger la forêt
            </span>
          </motion.h1>

          <motion.p
            variants={fadeIn}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#a0b0a0] sm:text-lg"
          >
            PyroScope 33 est un outil open source de suivi du risque d&apos;incendie
            sur le département de la Gironde. Données satellite, météo haute
            résolution et modèles scientifiques — gratuit, transparent,
            auto-hébergeable.
          </motion.p>

          <motion.div
            variants={fadeIn}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Button
              size="lg"
              className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-500 sm:w-auto"
              onClick={() => navigate("/auth")}
            >
              Accéder à la carte
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-[#2a3a2a] text-[#a0b0a0] hover:bg-[#1a2e1a] hover:text-[#e8e0d8] sm:w-auto"
              onClick={() => {
                document
                  .getElementById("features")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              En savoir plus
            </Button>
          </motion.div>
        </div>
      </motion.section>

      {/* ── Features ────────────────────────────────────────────── */}
      <motion.section
        id="features"
        className="relative px-4 py-20"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={{
          animate: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <div className="mx-auto max-w-7xl">
          <motion.h2
            variants={fadeIn}
            className="mb-4 text-center text-2xl font-bold sm:text-3xl"
          >
            Données et modèles scientifiques
          </motion.h2>
          <motion.p
            variants={fadeIn}
            className="mb-12 text-center text-[#a0b0a0]"
          >
            Six couches d&apos;information croisées pour évaluer le risque à
            l&apos;échelle de la cellule de 250 m.
          </motion.p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Satellite,
                title: "Feux actifs live",
                desc: "Points chauds NASA FIRMS (VIIRS + MODIS) en quasi temps réel, rafraîchis toutes les 15 minutes.",
              },
              {
                icon: Thermometer,
                title: "Météo HD",
                desc: "Prévision AROME France HD (~1,5 km) : température, vent, humidité, précipitations, ETP.",
              },
              {
                icon: Wind,
                title: "Vent animé",
                desc: "Particules de vent couche par couche, isothermes, évolution horaire sur 48 h.",
              },
              {
                icon: Trees,
                title: "Végétation",
                desc: "BD Forêt V2, NDVI/NDMI Sentinel-2, stress hydrique, modèles de combustible.",
              },
              {
                icon: Flame,
                title: "Propagation",
                desc: "Modèle FBP (cime incluse) + Rothermel secondaire. Cônes à 1/3/6/12 h avec vent par échéance.",
              },
              {
                icon: Map,
                title: "Carte interactive",
                desc: "MapLibre GL, fond IGN/OSM, mode simulation, décomposition des scores au clic.",
              },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeIn}>
                <Card className="h-full border-[#2a3a2a] bg-[#1a2e1a]/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/20">
                      <feature.icon className="h-5 w-5 text-amber-400" />
                    </div>
                    <h3 className="mb-1 font-semibold">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-[#a0b0a0]">
                      {feature.desc}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="relative px-4 py-20">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1a0f] via-transparent to-transparent" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Shield className="mx-auto mb-4 h-10 w-10 text-amber-500" />
          <h2 className="text-2xl font-bold sm:text-3xl">
            Visualiser le risque aujourd&apos;hui
          </h2>
          <p className="mt-4 text-[#a0b0a0]">
            PyroScope 33 est un projet open source. Données gratuites, zéro
            abonnement. Auto-hébergement par docker compose.
          </p>
          <Button
            size="lg"
            className="mt-8 gap-2 bg-amber-600 text-white hover:bg-amber-500"
            onClick={() => navigate("/auth")}
          >
            Accéder à la carte
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Attribution ─────────────────────────────────────────── */}
      <footer className="border-t border-[#2a3a2a] px-4 py-6 text-center text-[10px] text-[#607060] sm:text-xs">
        <p>
          NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN ·
          OpenStreetMap © contributeurs (ODbL)
        </p>
        <p className="mt-2">
          PyroScope 33 — Projet open source. Aucune valeur opérationnelle.{" "}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[#a0b0a0]"
          >
            Code source
          </a>
        </p>
      </footer>
    </div>
  );
}
