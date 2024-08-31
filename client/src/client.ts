import { Bitmap } from "./bitmap";

const PROTCOL_VERSION = 1;

export const enum MessageType {
	Hello = 0x0,
	StatsRequest = 0x1,
	StatsResponse = 0x2,
	FullStateRequest = 0x10,
	FullStateResponse = 0x11,
	PartialStateUpdate = 0x12,
	ToggleBit = 0x13,
}

export interface HelloMessage {
	msg: MessageType.Hello;
	versionMajor: number;
	versionMinor: number;
}

export interface StatsRequestMessage {
	msg: MessageType.StatsRequest;
}

export interface StatsResponseMessage {
	msg: MessageType.StatsResponse;
	currentClients: number;
}

export interface FullStateRequestMessage {
	msg: MessageType.FullStateRequest;
}

export interface FullStateResponseMessage {
	msg: MessageType.FullStateResponse;
	bitCount: number;
	bitmap: Uint8Array;
}

export interface PartialStateUpdateMessage {
	msg: MessageType.PartialStateUpdate;
	offset: number;
	chunk: Uint8Array;
}

export interface ToggleBitMessage {
	msg: MessageType.ToggleBit;
	index: number;
}

export type ClientMessage = StatsRequestMessage | FullStateRequestMessage | ToggleBitMessage;
export type ServerMessage = HelloMessage | StatsResponseMessage | FullStateResponseMessage | PartialStateUpdateMessage;

export type Message = ClientMessage | ServerMessage;

export class BitmapClient {
	websocket: WebSocket | null = null;

	constructor(public bitmap: Bitmap) {
		this.openWebSocket();
	}

	public toggle(index: number) {
		this.send({ msg: MessageType.ToggleBit, index });
		this.bitmap.set(index, !this.bitmap.get(index));
	}

	private openWebSocket() {
		if (this.websocket) {
			this.websocket.close();
		}

		const ws = new WebSocket("ws://localhost:2253");
		ws.binaryType = "arraybuffer";
		this.websocket = ws;

		ws.addEventListener("open", () => {
			console.log("Connected to server");
			this.onOpen();
		});

		ws.addEventListener("message", (message) => {
			if (message.data instanceof ArrayBuffer) {
				const msg = this.deserialize(message.data);
				if (msg) this.onMessage(msg);
			}
		});

		ws.addEventListener("close", () => {
			console.log("Disconnected from server");
			this.websocket = null;
			setTimeout(() => this.openWebSocket(), 1000);
		});

		ws.addEventListener("error", (err) => {
			console.error(err);
		});
	}

	private onOpen() {}

	private onMessage(msg: ServerMessage) {
		console.log("Received message", msg);

		if (msg.msg === MessageType.Hello) {
			if (msg.versionMajor !== PROTCOL_VERSION) {
				this.websocket?.close();
				alert("Incompatible protocol version");
			}

			this.send({ msg: MessageType.StatsRequest });
			this.send({ msg: MessageType.FullStateRequest });
		} else if (msg.msg === MessageType.StatsResponse) {
			console.log("Current clients:", (msg as StatsResponseMessage).currentClients);
		} else if (msg.msg === MessageType.FullStateResponse) {
			const fullState = msg as FullStateResponseMessage;
			this.bitmap.fullStateUpdate(fullState.bitmap);
		} else if (msg.msg === MessageType.PartialStateUpdate) {
			const partialState = msg as PartialStateUpdateMessage;
			this.bitmap.partialStateUpdate(partialState.offset, partialState.chunk);
		}
	}

	private deserialize(data: ArrayBuffer): ServerMessage | undefined {
		const payload = new Uint8Array(data);
		const dataView = new DataView(data);

		const msg = payload[0];

		if (msg === MessageType.Hello) {
			const versionMajor = dataView.getUint16(1, true);
			const versionMinor = dataView.getUint16(3, true);

			return { msg, versionMajor, versionMinor } as HelloMessage;
		} else if (msg === MessageType.StatsResponse) {
			const currentClients = dataView.getUint32(1, true);

			return { msg, currentClients } as StatsResponseMessage;
		} else if (msg === MessageType.FullStateResponse) {
			const bitCount = dataView.getUint32(1, true);
			const bitmap = payload.slice(5);

			return { msg, bitCount, bitmap } as FullStateResponseMessage;
		} else if (msg === MessageType.PartialStateUpdate) {
			const offset = dataView.getUint32(1, true);
			const chunk = payload.slice(5);

			return { msg, offset, chunk } as PartialStateUpdateMessage;
		} else {
			return undefined;
		}
	}

	private send(msg: ClientMessage) {
		if (!this.websocket) return;

		const data = this.serialize(msg);
		this.websocket.send(data);
	}

	private serialize(msg: ClientMessage) {
		if (msg.msg === MessageType.StatsRequest || msg.msg === MessageType.FullStateRequest) {
			return new Uint8Array([msg.msg]);
		} else if (msg.msg === MessageType.ToggleBit) {
			const data = new Uint8Array(5);
			data[0] = msg.msg;
			const view = new DataView(data.buffer);
			view.setUint32(1, msg.index, true);

			return data;
		} else {
			throw new Error("Invalid message type");
		}
	}
}
