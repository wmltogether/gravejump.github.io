import { Application, VERSION } from "pixi.js";
import { C, Game, FrameRunner } from "./engine/index.ts";
import type { GameStatus } from "./engine/types.ts";
import { InputController } from "./input/InputController.ts";
import { SoundManager } from "./audio/SoundManager.ts";
import { createSceneRenderer } from "./render/SceneRenderer.ts";
import { createGameUI } from "./ui/GameUI.ts";
import { element } from "./ui/dom.ts";
import { fitGameFrame, resizedCamera } from "./ui/viewport.ts";

/** Composition root: wires independently testable simulation and browser adapters. */
async function bootstrap(): Promise<void> {
  const game = new Game();
  const runner = new FrameRunner(game);
  const sound = new SoundManager();
  const app = new Application();
  const viewport = element("game-viewport");
  const host = element("scene");
  await app.init({
    width: C.WIDTH,
    height: C.HEIGHT,
    antialias: true,
    backgroundAlpha: 0,
    resolution: Math.min(devicePixelRatio || 1, 2),
    // CSS owns the display size; autoDensity writes fixed inline px that crop phones.
    autoDensity: false,
    preference: "webgl",
  });
  app.canvas.draggable = false;
  host.appendChild(app.canvas);
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  const scene = await createSceneRenderer(app, game);
  const ui = createGameUI(game, () => sound.play("note"));
  let helpOpen = false;
  let helpPrevious: GameStatus = "ready";

  const input = new InputController({
    viewport,
    buttons: {
      left: element<HTMLButtonElement>("left"),
      right: element<HTMLButtonElement>("right"),
      jump: element<HTMLButtonElement>("jump"),
    },
    isPlaying: () => game.status === "playing",
    onPause: () => {
      if (helpOpen) startOrResume();
      else togglePause();
    },
    onStart: () => startOrResume(),
  });

  function clearInput(): void {
    input.clear();
    runner.reset();
  }

  function startOrResume(forceRestart = false): void {
    if (helpOpen) {
      helpOpen = false;
      if (helpPrevious === "paused") {
        ui.show("paused");
        return;
      }
    }
    clearInput();
    if (game.status === "paused" && !forceRestart) game.pause();
    else {
      scene.clear();
      game.autoJump = true;
      document.body.classList.add("session-active");
      fitPortrait();
      resize();
      game.start();
      ui.reset();
      element("game-status").textContent = "踩稳石台，留意头顶的坠落预警。";
    }
    ui.hide();
    viewport.focus({ preventScroll: true });
    ui.update();
  }

  function togglePause(): void {
    if (helpOpen || !["playing", "paused"].includes(game.status)) return;
    clearInput();
    game.pause();
    if (game.status === "paused") ui.show("paused");
    else {
      ui.hide();
      viewport.focus({ preventScroll: true });
    }
    ui.update();
  }

  function fitPortrait(): void {
    const visible = window.visualViewport;
    const width = Math.min(
      window.innerWidth,
      visible?.width ?? window.innerWidth,
    );
    const height = visible?.height ?? window.innerHeight;
    const style = document.documentElement.style;
    const fitted =
      width <= 750 || document.body.classList.contains("session-active");
    document.body.classList.toggle("viewport-fit", fitted);
    style.setProperty("--app-height", `${height}px`);
    style.setProperty("--app-width", `${width}px`);
    style.setProperty("--visual-top", `${visible?.offsetTop ?? 0}px`);
    style.setProperty("--visual-left", `${visible?.offsetLeft ?? 0}px`);
    if (!fitted) return;
    const main = document.querySelector("main")!;
    const padding = getComputedStyle(main);
    const card = document
      .querySelector<HTMLElement>(".game-card")!
      .getBoundingClientRect();
    const canvas = host.getBoundingClientRect();
    const border = viewport.getBoundingClientRect().height - canvas.height;
    const header = document
      .querySelector("header")!
      .getBoundingClientRect().height;
    const frame = fitGameFrame(
      width -
        parseFloat(padding.paddingLeft) -
        parseFloat(padding.paddingRight),
      height -
        header -
        parseFloat(padding.paddingTop) -
        parseFloat(padding.paddingBottom),
      card.width - canvas.width,
      card.height - canvas.height,
      width > 750 ? 3 / 4 : undefined,
    );
    document
      .querySelector(".game-card")!
      .classList.toggle("is-compact", frame.cardWidth < 300);
    style.setProperty("--fitted-card-width", `${frame.cardWidth}px`);
    style.setProperty(
      "--fitted-viewport-height",
      `${frame.canvasHeight + border}px`,
    );
    style.setProperty("--ratio", String(frame.ratio));
  }
  fitPortrait();
  window.addEventListener("resize", fitPortrait);
  window.visualViewport?.addEventListener("resize", fitPortrait);
  window.visualViewport?.addEventListener("scroll", fitPortrait);
  window.addEventListener("orientationchange", () =>
    requestAnimationFrame(fitPortrait),
  );
  document.fonts?.ready.then(fitPortrait);
  // Prevent wheel and mobile overscroll only during an active game session.
  document.addEventListener(
    "wheel",
    (event) => {
      if (document.body.classList.contains("session-active"))
        event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      if (document.body.classList.contains("session-active"))
        event.preventDefault();
    },
    { passive: false },
  );

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const height = Math.round(
      (C.WIDTH * rect.height) / Math.max(1, rect.width),
    );
    if (game.viewHeight !== height) {
      const oldHeight = game.viewHeight;
      game.viewHeight = height;
      if (game.status === "ready") {
        game.reset();
        scene.clear();
      } else
        game.cameraY = resizedCamera(
          game.player.y,
          game.cameraY,
          oldHeight,
          height,
        );
    }
    scene.resize();
  }

  element("start").addEventListener("click", () => startOrResume());
  element("pause").addEventListener("click", togglePause);
  element("secondary").addEventListener("click", () => {
    helpOpen = false;
    startOrResume(true);
  });
  element("help").addEventListener("click", () => {
    if (helpOpen) return;
    helpPrevious = game.status;
    if (game.status === "playing") {
      clearInput();
      game.pause();
    }
    helpOpen = true;
    ui.show("help");
  });
  element("sound").addEventListener("click", async () => {
    const enabled = await sound.toggle();
    const button = element("sound");
    button.classList.toggle("muted", !enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "关闭声音" : "打开声音");
    button.title = enabled ? "关闭声音" : "打开声音";
  });

  // Keep keyboard users inside an open dialog, while gameplay keys stay separate.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || element("overlay").hidden) return;
    const first = element("start");
    const secondary = element("secondary");
    const last = secondary.hidden ? first : secondary;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  resize();
  new ResizeObserver(resize).observe(host);
  ui.update();
  element("load-status").hidden = true;
  element<HTMLButtonElement>("start").disabled = false;

  app.ticker.add((ticker) => {
    const elapsed = Math.min(ticker.deltaMS / 1000, 0.1);
    runner.advance(elapsed, input.readFrame());
    for (const event of game.drainEvents()) {
      switch (event.type) {
        case "jump":
          scene.burst(event.x, event.y, 0xc3d2a2, 6);
          sound.play("jump");
          break;
        case "land":
          scene.burst(event.x, event.y, 0xe9e0b6, 5);
          break;
        case "note":
          scene.burst(event.x, event.y, 0xb2c771, 12);
          sound.play("note");
          break;
        case "heal":
          scene.burst(event.x, event.y, 0xd1e5ab, 14);
          ui.heal(event.x, event.y, event.restored);
          sound.play("note");
          element("announcement").textContent =
            event.restored > 0
              ? `恢复一颗生命，当前 ${game.lives} 颗心。`
              : "吃掉黄瓜，生命已满。";
          break;
        case "rocket":
          scene.burst(event.x, event.y, 0x9bdee7, 18);
          sound.play("note");
          element("announcement").textContent =
            "火箭启动，冲刺三秒，免疫伤害。";
          break;
        case "stomp":
          scene.burst(event.x, event.y, 0x91bbdb, 16);
          sound.play("note");
          element("announcement").textContent = "踩中企鹅，继续向上。";
          break;
        case "throw":
          scene.burst(event.x, event.y, 0xb7adbf, 3);
          break;
        case "hit":
          scene.burst(event.x, event.y, 0xf2a07c, 20);
          scene.hit();
          sound.play("hit");
          element("announcement").textContent =
            `被坠落物碰到了，剩余 ${game.lives} 颗爱心。`;
          break;
        case "over":
          clearInput();
          ui.show("over");
          element("game-status").textContent =
            game.reason === "hazards"
              ? "留意头顶预警，准备下一次返场。"
              : "这次的返场纪录已保存，再来一次吧。";
          element("announcement").textContent =
            `演出结束。本次高度 ${game.height} 米，收集 ${game.notes} 个音符。`;
          break;
        case "music":
          element("announcement").textContent =
            `登上第 ${event.floor} 层，解锁第 ${event.tier} 重舞台氛围。`;
          break;
        case "hazard":
          break;
      }
    }
    ui.update();
    scene.render(elapsed);
    // Non-interactive DOM diagnostics make real browser tests observable.
    viewport.dataset.status = game.status;
    viewport.dataset.playerX = String(Math.round(game.player.x));
    viewport.dataset.playerY = String(Math.round(game.player.y));
    viewport.dataset.hazards = String(game.hazards.length);
    viewport.dataset.warnings = String(game.warnings.length);
    viewport.dataset.engine = `PixiJS ${VERSION} / TypeScript / 120Hz`;
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  element("load-status").textContent = "舞台加载失败，请刷新页面重试。";
});
