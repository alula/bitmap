import { Component, createRef, RefObject } from "inferno";

// ported from https://github.com/tie/oneko/blob/master/oneko.c

const enum NekoState {
	NEKO_STOP = 0,
	NEKO_JARE = 1,
	NEKO_KAKI = 2,
	NEKO_AKUBI = 3,
	NEKO_SLEEP = 4,
	NEKO_AWAKE = 5,
	NEKO_U_MOVE = 6,
	NEKO_D_MOVE = 7,
	NEKO_L_MOVE = 8,
	NEKO_R_MOVE = 9,
	NEKO_UL_MOVE = 10,
	NEKO_UR_MOVE = 11,
	NEKO_DL_MOVE = 12,
	NEKO_DR_MOVE = 13,
	NEKO_U_TOGI = 14,
	NEKO_D_TOGI = 15,
	NEKO_L_TOGI = 16,
	NEKO_R_TOGI = 17,
}

const awake = 0;
const down1 = 1;
const down2 = 2;
const dtogi1 = 3;
const dtogi2 = 4;
const dwleft1 = 5;
const dwleft2 = 6;
const dwright1 = 7;
const dwright2 = 8;
const jare2 = 9;
const kaki1 = 10;
const kaki2 = 11;
const left1 = 12;
const left2 = 13;
const ltogi1 = 14;
const ltogi2 = 15;
const mati2 = 16;
const mati3 = 17;
const right1 = 18;
const right2 = 19;
const rtogi1 = 20;
const rtogi2 = 21;
const sleep1 = 22;
const sleep2 = 23;
const up1 = 24;
const up2 = 25;
const upleft1 = 26;
const upleft2 = 27;
const upright1 = 28;
const upright2 = 29;
const utogi1 = 30;
const utogi2 = 31;

type SpriteType =
	| typeof awake
	| typeof down1
	| typeof down2
	| typeof dtogi1
	| typeof dtogi2
	| typeof dwleft1
	| typeof dwleft2
	| typeof dwright1
	| typeof dwright2
	| typeof jare2
	| typeof kaki1
	| typeof kaki2
	| typeof left1
	| typeof left2
	| typeof ltogi1
	| typeof ltogi2
	| typeof mati2
	| typeof mati3
	| typeof right1
	| typeof right2
	| typeof rtogi1
	| typeof rtogi2
	| typeof sleep1
	| typeof sleep2
	| typeof up1
	| typeof up2
	| typeof upleft1
	| typeof upleft2
	| typeof upright1
	| typeof upright2
	| typeof utogi1
	| typeof utogi2;

const NEKO_STOP_TIME = 4;
const NEKO_JARE_TIME = 10;
const NEKO_KAKI_TIME = 4;
const NEKO_AKUBI_TIME = 6;
const NEKO_AWAKE_TIME = 3;
const NEKO_TOGI_TIME = 10;

const NEKO_SPEED = 13;
const BITMAP_SIZE = 32;
const MAX_TICK = 9999;

const SIN_PI_PER_8 = 0.382683432; //Math.sin(Math.PI / 8);
const SIN_PI_PER_8_TIMES_3 = 3 * SIN_PI_PER_8; // Math.sin(Math.PI / 8 * 3);

const patterns: Array<[SpriteType, SpriteType]> = [
	[mati2, mati2],
	[jare2, mati2],
	[kaki1, kaki2],
	[mati3, mati3],
	[sleep1, sleep2],
	[awake, awake],
	[up1, up2],
	[down1, down2],
	[left1, left2],
	[right1, right2],
	[upleft1, upleft2],
	[upright1, upright2],
	[dwleft1, dwleft2],
	[dwright1, dwright2],
	[utogi1, utogi2],
	[dtogi1, dtogi2],
	[ltogi1, ltogi2],
	[rtogi1, rtogi2],
];

interface Point {
	x: number;
	y: number;
}

class Neko {
	#state: NekoState = NekoState.NEKO_STOP;
	#tickCount: number = 0;
	#stateCount: number = 0;

	sprite: SpriteType = mati2;
	pos: Point = { x: 0, y: 0 };
	#moveDelta: Point = { x: 0, y: 0 };

	#displaySize: Point = { x: 0, y: 0 };
	#ptr: Point = { x: 0, y: 0 };
	#ptrPrev: Point = { x: 0, y: 0 };

	constructor(displaySize: Point) {
		this.#displaySize = displaySize;
	}

	mouseMoved(x: number, y: number) {
		this.#ptr.x = x;
		this.#ptr.y = y;
	}

	setDisplaySize(x: number, y: number) {
		this.#displaySize.x = x;
		this.#displaySize.y = y;
	}

	updateNeko() {
		this.#calcDxDy();

		if (this.#state !== NekoState.NEKO_SLEEP) {
			this.sprite = patterns[this.#state][this.#tickCount & 1];
		} else {
			this.sprite = patterns[this.#state][(this.#tickCount >> 2) & 1];
		}

		if (++this.#tickCount >= MAX_TICK) {
			this.#tickCount = 0;
		}

		if (this.#tickCount % 2 === 0) {
			if (this.#stateCount < MAX_TICK) {
				this.#stateCount++;
			}
		}

		switch (this.#state) {
			case NekoState.NEKO_STOP:
				if (this.#checkAwake()) break;

				if (this.#stateCount < NEKO_STOP_TIME) {
					break;
				}

				if (this.#moveDelta.x < 0 && this.pos.x <= 0) {
					this.#setState(NekoState.NEKO_L_TOGI);
				} else if (this.#moveDelta.x > 0 && this.pos.x >= this.#displaySize.x - BITMAP_SIZE) {
					this.#setState(NekoState.NEKO_R_TOGI);
				} else if (this.#moveDelta.y < 0 && this.pos.y <= 0) {
					this.#setState(NekoState.NEKO_U_TOGI);
				} else if (this.#moveDelta.y > 0 && this.pos.y >= this.#displaySize.y - BITMAP_SIZE) {
					this.#setState(NekoState.NEKO_D_TOGI);
				} else {
					this.#setState(NekoState.NEKO_JARE);
				}
				break;
			case NekoState.NEKO_JARE:
				this.#preSleepState(NekoState.NEKO_KAKI, NEKO_JARE_TIME);
				break;
			case NekoState.NEKO_KAKI:
				this.#preSleepState(NekoState.NEKO_AKUBI, NEKO_KAKI_TIME);
				break;
			case NekoState.NEKO_AKUBI:
				this.#preSleepState(NekoState.NEKO_SLEEP, NEKO_AKUBI_TIME);
				break;
			case NekoState.NEKO_SLEEP:
				this.#checkAwake();
				break;
			case NekoState.NEKO_AWAKE:
				if (this.#stateCount < NEKO_AWAKE_TIME) {
					break;
				}
				this.#nekoDirection();
				break;
			case NekoState.NEKO_U_MOVE:
			case NekoState.NEKO_D_MOVE:
			case NekoState.NEKO_L_MOVE:
			case NekoState.NEKO_R_MOVE:
			case NekoState.NEKO_UL_MOVE:
			case NekoState.NEKO_UR_MOVE:
			case NekoState.NEKO_DL_MOVE:
			case NekoState.NEKO_DR_MOVE:
				this.pos.x += this.#moveDelta.x;
				this.pos.y += this.#moveDelta.y;
				this.#nekoDirection();
				break;
			case NekoState.NEKO_U_TOGI:
			case NekoState.NEKO_D_TOGI:
			case NekoState.NEKO_L_TOGI:
			case NekoState.NEKO_R_TOGI:
				this.#preSleepState(NekoState.NEKO_KAKI, NEKO_TOGI_TIME);
				break;
			default:
				break;
		}

		this.#ptrPrev.x = this.#ptr.x;
		this.#ptrPrev.y = this.#ptr.y;
	}

	#checkAwake() {
		if (this.#isMoveStart()) {
			this.#setState(NekoState.NEKO_AWAKE);
			return true;
		}

		return false;
	}

	#preSleepState(s: NekoState, t: number) {
		if (this.#checkAwake()) return;

		if (this.#stateCount < t) {
			return;
		}

		this.#setState(s);
	}

	#setState(state: NekoState) {
		this.#state = state;
		this.#stateCount = 0;
		this.#tickCount = 0;
	}

	#nekoDirection() {
		let newState = NekoState.NEKO_STOP;

		if (this.#moveDelta.x !== 0 || this.#moveDelta.y !== 0) {
			const largeX = this.#moveDelta.x;
			const largeY = -this.#moveDelta.y;
			const length = Math.sqrt(largeX * largeX + largeY * largeY);
			const sinTheta = largeY / length;

			const right = largeX > 0;

			if (sinTheta > SIN_PI_PER_8_TIMES_3) {
				newState = NekoState.NEKO_U_MOVE;
			} else if (sinTheta <= SIN_PI_PER_8_TIMES_3 && sinTheta > SIN_PI_PER_8) {
				newState = right ? NekoState.NEKO_UR_MOVE : NekoState.NEKO_UL_MOVE;
			} else if (sinTheta <= SIN_PI_PER_8 && sinTheta > -SIN_PI_PER_8) {
				newState = right ? NekoState.NEKO_R_MOVE : NekoState.NEKO_L_MOVE;
			} else if (sinTheta <= -SIN_PI_PER_8 && sinTheta > -SIN_PI_PER_8_TIMES_3) {
				newState = right ? NekoState.NEKO_DR_MOVE : NekoState.NEKO_DL_MOVE;
			} else {
				newState = NekoState.NEKO_D_MOVE;
			}
		}

		if (this.#state !== newState) {
			this.#setState(newState);
		}
	}

	#calcDxDy() {
		const largeX = this.#ptr.x - this.pos.x - BITMAP_SIZE / 2;
		const largeY = this.#ptr.y - this.pos.y - BITMAP_SIZE;

		const lengthSq = largeX * largeX + largeY * largeY;

		if (lengthSq !== 0) {
			const length = Math.sqrt(lengthSq);

			if (length <= NEKO_SPEED) {
				this.#moveDelta.x = largeX | 0;
				this.#moveDelta.y = largeY | 0;
			} else {
				this.#moveDelta.x = ((largeX * NEKO_SPEED) / length) | 0;
				this.#moveDelta.y = ((largeY * NEKO_SPEED) / length) | 0;
			}
		} else {
			this.#moveDelta.x = 0;
			this.#moveDelta.y = 0;
		}
	}

	#isMoveStart(): boolean {
		const dx = Math.abs(this.#ptr.x - this.#ptrPrev.x);
		const dy = Math.abs(this.#ptr.y - this.#ptrPrev.y);
		const d = 13;

		return dx > d || dy > d;
	}
}

export class NekoComponent extends Component {
	neko: Neko;
	ref: RefObject<HTMLDivElement>;
	interval: NodeJS.Timeout | undefined = undefined;

	constructor() {
		super();
		this.neko = new Neko({
			x: window.innerWidth,
			y: window.innerHeight,
		});
		this.ref = createRef();
	}

	componentDidMount(): void {
		const dispWidth = window.innerWidth;
		const dispHeight = window.innerHeight;

		this.neko.setDisplaySize(dispWidth, dispHeight);
		this.neko.pos.x = (dispWidth / 2) | 0;
		this.neko.pos.y = (dispHeight / 2) | 0;
		window.addEventListener("mousemove", this.onMouseMove);
		window.addEventListener("resize", this.onResize);
		this.interval = setInterval(this.updateNeko, 125);

		const el = this.ref.current!;
		el.style.position = "fixed";
		el.style.zIndex = "9999";
		el.style.width = `${BITMAP_SIZE}px`;
		el.style.height = `${BITMAP_SIZE}px`;
		el.style.pointerEvents = "none";
		el.style.backgroundImage = "url(/assets/neko.png)";
	}

	componentWillUnmount(): void {
		window.removeEventListener("mousemove", this.onMouseMove);
		window.removeEventListener("resize", this.onResize);
		clearInterval(this.interval);
	}

	updateNeko = () => {
		this.neko.updateNeko();

		const el = this.ref.current;
		if (el) {
			el.style.left = this.neko.pos.x + "px";
			el.style.top = this.neko.pos.y + "px";
			el.style.backgroundPosition = `-${this.neko.sprite * BITMAP_SIZE}px 0`;
		}
	};

	onMouseMove = (e: MouseEvent) => {
		this.neko.mouseMoved(e.clientX, e.clientY);
	};

	onResize = () => {
		this.neko.setDisplaySize(window.innerWidth, window.innerHeight);
	};

	render() {
		return <div ref={this.ref} />;
	}
}
