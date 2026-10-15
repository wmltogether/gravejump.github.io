import { C } from "../engine/config.ts";

export interface HealthState {
  lives: number;
  critical: boolean;
  protected: boolean;
  title: string;
  detail: string;
}

/** Presentation rules are independent of both the renderer and the DOM. */
export function describeHealth(
  lives: number,
  protectedNow: boolean,
  over: boolean,
): HealthState {
  const count = Math.min(
    C.MAX_LIVES,
    Math.max(0, Math.floor(Number.isFinite(lives) ? lives : 0)),
  );
  const state = {
    lives: count,
    critical: count === 1 && !over,
    protected: protectedNow && !over,
    title: "",
    detail: "",
  };
  if (over || count === 0) {
    state.title = count === 0 ? "演出暂停，准备返场" : "心跳还在，再来一段！";
    state.detail = "下一次，一定能跳得更高";
  } else if (protectedNow) {
    state.title = "短暂保护中";
    state.detail =
      count === 1 ? "最后一颗心，快找安全位置！" : "稳住，趁现在躲开落石";
  } else if (count === 1) {
    state.title = "只剩一颗心，小心！";
    state.detail = "看见红色预警就赶紧闪开";
  } else if (count < C.MAX_LIVES) {
    state.title = "跟上节拍，继续向上";
    state.detail = "先躲好落石，再跳高一点";
  } else {
    state.title = "元气满满，出发！";
    state.detail = "留意头顶的落石预警";
  }
  return state;
}

interface HealthElements {
  panel: HTMLElement;
  meter: HTMLElement;
  hearts: HTMLElement[];
  count: HTMLElement;
  title: HTMLElement;
  detail: HTMLElement;
  icon: HTMLElement;
  viewport: HTMLElement;
  callout: HTMLElement;
}

/** Updates stable heart elements; scoring updates must never restart loss animation. */
export class HealthDisplay {
  private readonly elements: HealthElements;
  private previousLives: number | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private effectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(elements: HealthElements) {
    this.elements = elements;
  }

  update(lives: number, protectedNow: boolean, over: boolean): void {
    const state = describeHealth(lives, protectedNow, over);
    const e = this.elements;
    if (this.previousLives !== null && state.lives < this.previousLives)
      this.showDamage(state.lives, this.previousLives);
    if (this.previousLives !== null && state.lives > this.previousLives) {
      clearTimeout(this.recoveryTimer);
      e.hearts.forEach((heart) => heart.classList.remove("restored-now"));
      for (let i = this.previousLives; i < state.lives; i++)
        e.hearts[i]?.classList.add("restored-now");
      this.recoveryTimer = setTimeout(
        () =>
          e.hearts.forEach((heart) => heart.classList.remove("restored-now")),
        850,
      );
    }
    e.hearts.forEach((heart, index) => {
      heart.classList.toggle("is-full", index < state.lives);
      heart.classList.toggle("is-empty", index >= state.lives);
      heart.setAttribute("aria-hidden", "true");
    });
    e.count.textContent = String(state.lives);
    e.meter.setAttribute(
      "aria-label",
      `剩余生命 ${state.lives}，最多 ${C.MAX_LIVES} 颗心`,
    );
    e.panel.classList.toggle("is-critical", state.critical);
    e.panel.classList.toggle("is-protected", state.protected);
    e.title.textContent = state.title;
    e.detail.textContent = state.detail;
    e.icon.setAttribute("aria-label", `${state.title}，${state.detail}`);
    e.icon.setAttribute("title", `${state.title}，${state.detail}`);
    e.icon.innerHTML = state.protected
      ? '<svg aria-hidden="true"><use href="#shield"/></svg>'
      : state.critical
        ? '<svg aria-hidden="true"><use href="#alert"/></svg>'
        : '<svg aria-hidden="true"><use href="#star"/></svg>';
    this.previousLives = state.lives;
  }

  reset(): void {
    this.previousLives = null;
    clearTimeout(this.recoveryTimer);
    this.elements.hearts.forEach((heart) =>
      heart.classList.remove("restored-now"),
    );
    clearTimeout(this.effectTimer);
    this.clearEffects();
  }

  private showDamage(lives: number, previous: number): void {
    clearTimeout(this.effectTimer);
    this.clearEffects();
    // One layout read restarts a single impact animation, only when damage occurs.
    void this.elements.panel.offsetWidth;
    this.elements.viewport.classList.add("damage-active");
    this.elements.panel.classList.add("taking-damage");
    this.elements.callout.classList.add("visible");
    for (let index = lives; index < previous; index++)
      this.elements.hearts[index]?.classList.add("lost-now");
    this.effectTimer = setTimeout(() => this.clearEffects(), 1800);
  }

  private clearEffects(): void {
    const e = this.elements;
    e.viewport.classList.remove("damage-active");
    e.panel.classList.remove("taking-damage");
    e.callout.classList.remove("visible");
    e.hearts.forEach((heart) => heart.classList.remove("lost-now"));
  }
}
