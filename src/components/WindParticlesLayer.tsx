/**
 * WindParticlesLayer — Animated wind particles on MapLibre.
 *
 * Dessine des particules animées sur un canvas superposé à la carte.
 * En mode preview Freebuff : couche désactivée avec message
 * « donnée indisponible » (aucune donnée vent fabriquée).
 */

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

interface WindData {
  /** Grid of wind vectors: {lon, lat, u, v} */
  grid: Array<{ lon: number; lat: number; u: number; v: number }>;
}

interface WindParticlesLayerProps {
  map: maplibregl.Map;
  windData: WindData | null;
  visible?: boolean;
}

export default function WindParticlesLayer({
  map,
  windData,
  visible = true,
}: WindParticlesLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !visible || !windData || windData.grid.length === 0) return;

    // Créer un canvas superposé à la carte
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "10";

    const container = map.getCanvasContainer();
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Adapter la taille au conteneur
    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener("resize", resize);

    // Particules
    const particles: Array<{
      x: number;
      y: number;
      speed: number;
      life: number;
      maxLife: number;
    }> = [];

    const numParticles = Math.min(windData.grid.length * 3, 200);
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 0.3 + Math.random() * 0.7,
        life: 0,
        maxLife: 100 + Math.random() * 200,
      });
    }

    // Animer
    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.life++;
        if (p.life > p.maxLife) {
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
          p.life = 0;
          continue;
        }

        // Convertir pixel → lon/lat
        const bounds = map.getBounds();
        const lon =
          bounds.getWest() + (p.x / canvas.width) * (bounds.getEast() - bounds.getWest());
        const lat =
          bounds.getNorth() - (p.y / canvas.height) * (bounds.getNorth() - bounds.getSouth());

        // Trouver le vecteur vent le plus proche
        let u = 0,
          v = 0;
        let minDist = Infinity;
        for (const w of windData.grid) {
          const d = (w.lon - lon) ** 2 + (w.lat - lat) ** 2;
          if (d < minDist) {
            minDist = d;
            u = w.u;
            v = w.v;
          }
        }

        // Déplacer la particule (pixels)
        const speed = p.speed * 1.5;
        p.x += u * speed;
        p.y -= v * speed;

        // Reboucler
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Dessiner
        const alpha = 1 - p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 + p.speed, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${alpha * 0.7})`;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, windData, visible]);

  return null;
}
