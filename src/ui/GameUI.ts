import type { Game } from "../engine/Game.ts";
import { element as $ } from "./dom.ts";
import { HealthDisplay } from "./HealthDisplay.ts";
import { C } from "../engine/config.ts";
export interface GameUI {
  update(): void;
  show(mode: "over" | "paused" | "help"): void;
  hide(): void;
  reset(): void;
  heal(
    x: number,
    y: number,
    restored: number,
    source?: "cucumber" | "star",
  ): void;
}
/** DOM-only status and menus. Persistent records are isolated from simulation. */
export function createGameUI(game: Game, onMilestone: () => void): GameUI {
  const health = new HealthDisplay({
    panel: $("life-panel"),
    meter: $("lives"),
    hearts: Array.from(
      $("lives").querySelectorAll<HTMLElement>("[data-heart]"),
    ),
    count: $("life-count"),
    title: $("health-status"),
    detail: $("health-detail"),
    icon: $("health-state-icon"),
    viewport: $("game-viewport"),
    callout: $("damage-callout"),
  });
  let best = 0,
    lastMilestone = 0,
    lastHUD = "";
  let healTimer: ReturnType<typeof setTimeout> | undefined;
  let milestoneTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    best = Math.max(
      0,
      Math.floor(Number(localStorage.getItem("grave-jump-best")) || 0),
    );
  } catch {}
  function updateBest(): void {
    const next = (Math.floor(best / 100) + 1) * 100;
    $("best").textContent = String(best);
    $("next-goal").textContent = next + " m";
    $("best-progress").style.width = (best % 100) + "%";
  }
  function updateHUD(): void {
    const key = [
      game.height,
      game.notes,
      game.floor,
      game.musicTier,
      game.lives,
      game.status,
      game.invulnerable > 0,
      Math.ceil(game.rocketTime * 10),
      Math.ceil(game.penguinSuppressionTime * 10),
    ].join("|");
    if (key === lastHUD) return;
    lastHUD = key;
    $("height").textContent = String(game.height).padStart(3, "0");
    $("notes").textContent = String(game.notes);
    $("zone").textContent = String(game.floor).padStart(2, "0");
    $("music-stage").textContent =
      `${String(Math.min(5, game.musicTier)).padStart(2, "0")} / 05`;
    document.querySelectorAll<HTMLElement>("[data-tier]").forEach((item) => {
      item.classList.toggle(
        "unlocked",
        Number(item.dataset.tier) <= game.musicTier,
      );
    });
    health.update(
      game.lives,
      game.invulnerable > 0 || game.rocketTime > 0,
      game.status === "over",
    );
    $("rocket-status").hidden = game.rocketTime <= 0;
    $("rocket-seconds").textContent = game.rocketTime.toFixed(1);
    $("rocket-meter").style.width =
      `${(game.rocketTime / C.ROCKET_SECONDS) * 100}%`;
    $("star-status").hidden = game.penguinSuppressionTime <= 0;
    $("star-seconds").textContent =
      `${Math.ceil(game.penguinSuppressionTime)}s`;
    $<HTMLButtonElement>("pause").disabled =
      game.status === "ready" || game.status === "over";
    $("pause").setAttribute(
      "aria-label",
      game.status === "paused" ? "继续游戏" : "暂停游戏",
    );
    if (game.height > best) {
      best = game.height;
      updateBest();
      try {
        localStorage.setItem("grave-jump-best", String(best));
      } catch {}
    }
    const milestone = game.musicTier;
    if (milestone > lastMilestone) {
      lastMilestone = milestone;
      const reward = $("milestone");
      clearTimeout(milestoneTimer);
      reward.classList.remove("visible");
      reward.innerHTML =
        '<span class="reward-badge"><svg aria-hidden="true"><use href="#note"/></svg></span><strong>+1</strong><i class="reward-spark spark-a">✦</i><i class="reward-spark spark-b">✦</i><i class="reward-spark spark-c">✧</i>';
      reward.setAttribute(
        "aria-label",
        `达到 ${milestone * 10} 层，舞台氛围增加一重`,
      );
      reward.style.left = `${Math.max(15, Math.min(85, (game.player.x / C.WIDTH) * 100))}%`;
      reward.style.top = `${Math.max(23, Math.min(75, ((game.player.y - game.cameraY - 165) / game.viewHeight) * 100))}%`;
      void reward.offsetWidth;
      reward.classList.add("visible");
      milestoneTimer = setTimeout(
        () => reward.classList.remove("visible"),
        1700,
      );
      onMilestone();
    }
  }
  function overlay(mode: "over" | "paused" | "help") {
    $("overlay").querySelector<HTMLElement>(".overlay-card")!.dataset.mode =
      mode;
    $("overlay").hidden = false;
    $("results").hidden = mode !== "over";
    $("secondary").hidden = mode !== "paused" && mode !== "help";
    const label = $("overlay-label"),
      title = $("overlay-title"),
      description = $("overlay-description"),
      button = $("start"),
      tip = $("overlay-tip");
    if (mode === "over") {
      label.textContent = "";
      title.textContent = "游戏结束";
      description.textContent =
        game.reason === "hazards" ? "生命耗尽" : "掉出画面";
      $("final-height").innerHTML = game.height + "<small>m</small>";
      $("final-notes").textContent = String(game.notes);
      button.innerHTML = '再来一局 <svg><use href="#arrow"/></svg>';
      tip.textContent = "";
    } else if (mode === "paused") {
      label.textContent = "";
      title.textContent = "已暂停";
      description.textContent = "";
      button.innerHTML = '继续 <svg><use href="#arrow"/></svg>';
      tip.textContent = "P / Esc 继续";
    } else if (mode === "help") {
      label.textContent = "";
      title.textContent = "操作说明";
      description.innerHTML =
        "← → / A D：左右移动<br>空格 / ↑ / W：起跳，长按跳得更高<br>红色 ! 出现 1 秒后会落下坠落物，及时闪开<br>黄瓜恢复 1 颗心，上限 5 颗；满血也会吃掉<br>金星清除屏内企鹅、回满血，10 秒内不出现新企鹅<br>火箭冲刺 3 秒，免疫伤害；左右仍可移动<br>企鹅会投石，从上方踩中可击败<br>石台只接住向下落的脚；掉出画面就结束";
      button.innerHTML = '开始游戏 <svg><use href="#arrow"/></svg>';
      tip.textContent = "自动跳跃始终开启 · 手机按住画布左 / 右侧移动";
      $("secondary").hidden = true;
    }
    $("start").focus({ preventScroll: true });
  }

  updateBest();
  return {
    update: updateHUD,
    show: overlay,
    hide() {
      $("overlay").hidden = true;
    },
    heal(x, y, restored, source = "cucumber") {
      const popup = $("heal-callout");
      clearTimeout(healTimer);
      popup.classList.remove("visible");
      popup.innerHTML =
        source === "star"
          ? `<img draggable="false" src="golden-star.svg" alt="金星"/><svg aria-hidden="true"><use href="#heart"/></svg>${restored > 0 ? `<b>+${restored}</b>` : ""}`
          : restored > 0
            ? `<svg aria-hidden="true"><use href="#heart"/></svg><b>+${restored}</b>`
            : '<img src="cucumber.svg" alt="黄瓜"/><svg aria-hidden="true"><use href="#star"/></svg>';
      popup.setAttribute(
        "aria-label",
        source === "star"
          ? "金星清场，生命已回满"
          : restored > 0
            ? "恢复一颗生命"
            : "吃掉黄瓜，生命已满",
      );
      popup.style.left = `${Math.max(15, Math.min(85, (x / C.WIDTH) * 100))}%`;
      popup.style.top = `${Math.max(18, Math.min(80, ((y - game.cameraY - 75) / game.viewHeight) * 100))}%`;
      void popup.offsetWidth;
      popup.classList.add("visible");
      healTimer = setTimeout(() => popup.classList.remove("visible"), 1200);
    },
    reset() {
      clearTimeout(healTimer);
      $("heal-callout").classList.remove("visible");
      clearTimeout(milestoneTimer);
      health.reset();
      lastMilestone = 0;
      lastHUD = "";
      $("milestone").classList.remove("visible");
    },
  };
}
