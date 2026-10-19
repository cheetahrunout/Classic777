// The coin tray: PixiJS owns this canvas and its effects (architecture rule 2).
import 'pixi.js/unsafe-eval'; // shaders without eval, so the page's CSP can stay strict
import { Application, Container, Graphics } from 'pixi.js';
import { jitter } from './jitter.ts';

interface Coin { g: Container; vy: number; floor: number; spin: number; age: number; landed: boolean }

export interface Tray { drop(): void; destroy(): void }

export async function createTray(host: HTMLElement): Promise<Tray> {
  const app = new Application();
  try {
    await app.init({
      width: host.clientWidth,
      height: host.clientHeight,
      backgroundAlpha: 0,
      antialias: true,
      // The machine is scaled up to 1.25x by CSS; draw sharp for that and for the screen.
      resolution: Math.min(3, (window.devicePixelRatio || 1) * 1.25),
      autoDensity: true,
    });
  } catch {
    return { drop() {}, destroy() {} }; // no canvas support: the game plays on without the coins
  }
  app.canvas.classList.add('tray-canvas');
  host.appendChild(app.canvas);

  const coins: Coin[] = [];

  function makeCoin(): Container {
    const c = new Container();
    c.addChild(
      new Graphics().circle(0, 2, 11).fill({ color: 0x000000, alpha: 0.45 }),
      new Graphics().circle(0, 0, 11).fill(0xe9b83a).stroke({ width: 2, color: 0xb88a24 }),
      new Graphics().circle(0, 0, 6.5).stroke({ width: 1.5, color: 0x8a5a12, alpha: 0.7 }),
      new Graphics().ellipse(-3.5, -4, 4, 2.6).fill({ color: 0xfff6c4, alpha: 0.85 }),
    );
    return c;
  }

  app.ticker.add(ticker => {
    const dt = ticker.deltaMS;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.age += dt;
      if (!c.landed) {
        c.vy += 0.0028 * dt;
        c.g.y += c.vy * dt;
        c.g.rotation += c.spin * dt;
        if (c.g.y >= c.floor) {
          c.g.y = c.floor;
          c.landed = true;
          c.g.scale.y = 0.5;
        }
      }
      if (c.age > 3500) c.g.alpha = Math.max(0, 1 - (c.age - 3500) / 500);
      if (c.age > 4000) {
        c.g.destroy({ children: true });
        coins.splice(i, 1);
      }
    }
  });

  return {
    drop() {
      if (coins.length > 24) {
        coins[0].g.destroy({ children: true });
        coins.shift();
      }
      const g = makeCoin();
      g.x = 12 + jitter() * (app.screen.width - 24);
      g.y = -12;
      app.stage.addChild(g);
      coins.push({ g, vy: 0.05, floor: 30 + jitter() * 12, spin: (jitter() - 0.5) * 0.02, age: 0, landed: false });
    },
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}
