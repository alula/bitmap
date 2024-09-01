import { Bitmap } from "./bitmap";

export const PROTOCOL_VERSION = 1;
export const CHUNK_SIZE = 64 * 64 * 64;
export const CHUNK_SIZE_BYTES = CHUNK_SIZE / 8;
export const CHUNK_COUNT = 64 * 64;
export const BITMAP_SIZE = CHUNK_SIZE * CHUNK_COUNT;
export const UPDATE_CHUNK_SIZE = 32;

export const enum MessageType {
	Hello = 0x0,
	Stats = 0x1,
	ChunkFullStateRequest = 0x10,
	ChunkFullStateResponse = 0x11,
	PartialStateUpdate = 0x12,
	ToggleBit = 0x13,
	PartialStateSubscription = 0x14,
}

export interface HelloMessage {
	msg: MessageType.Hello;
	versionMajor: number;
	versionMinor: number;
}

export interface StatsMessage {
	msg: MessageType.Stats;
	currentClients: number;
}

export interface ChunkFullStateRequestMessage {
	msg: MessageType.ChunkFullStateRequest;
	chunkIndex: number;
}

export interface ChunkFullStateResponseMessage {
	msg: MessageType.ChunkFullStateResponse;
	chunkIndex: number;
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

export interface PartialStateSubscriptionMessage {
	msg: MessageType.PartialStateSubscription;
	chunkIndex: number;
}

export type ClientMessage = ChunkFullStateRequestMessage | ToggleBitMessage | PartialStateSubscriptionMessage;
export type ServerMessage = HelloMessage | StatsMessage | ChunkFullStateResponseMessage | PartialStateUpdateMessage;

export type Message = ClientMessage | ServerMessage;

export class BitmapClient {
	public bitmap: Bitmap;
	public goToCheckboxCallback: (index: number) => void = () => {};
	public loadingCallback: (loading: boolean) => void = () => {};
	public highlightedIndex = -1;

	private websocket: WebSocket | null = null;
	currentChunkIndex = 0;
	chunkLoaded = false;

	constructor() {
		this.bitmap = new Bitmap(CHUNK_SIZE);
		this.openWebSocket();
	}

	public isChecked(globalIndex: number) {
		const localIndex = globalIndex % CHUNK_SIZE;
		return this.bitmap.get(localIndex);
	}

	public toggle(globalIndex: number) {
		const localIndex = globalIndex % CHUNK_SIZE;
		// console.log("Toggling", globalIndex);
		this.send({ msg: MessageType.ToggleBit, index: globalIndex });
		this.bitmap.set(localIndex, !this.bitmap.get(localIndex));
	}

	get chunkIndex() {
		return this.currentChunkIndex;
	}

	public setChunkIndex(chunkIndex: number) {
		this.currentChunkIndex = chunkIndex;
		this.chunkLoaded = false;
		this.loadingCallback(true);
		this.send({ msg: MessageType.PartialStateSubscription, chunkIndex });
		this.send({ msg: MessageType.ChunkFullStateRequest, chunkIndex });
	}

	private openWebSocket() {
		console.log("Connecting to server");
		if (this.websocket) {
			this.websocket.close();
		}

		const ws = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL);
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
		// console.log("Received message", msg);

		if (msg.msg === MessageType.Hello) {
			if (msg.versionMajor !== PROTOCOL_VERSION) {
				this.websocket?.close();
				alert("Incompatible protocol version");
			}

			const chunkIndex = this.chunkIndex;

			this.send({ msg: MessageType.PartialStateSubscription, chunkIndex });
			this.send({ msg: MessageType.ChunkFullStateRequest, chunkIndex });
		} else if (msg.msg === MessageType.Stats) {
			console.log("Current clients:", (msg as StatsMessage).currentClients);
		} else if (msg.msg === MessageType.ChunkFullStateResponse) {
			const fullState = msg as ChunkFullStateResponseMessage;
			if (fullState.chunkIndex !== this.chunkIndex) return;

			this.bitmap.fullStateUpdate(fullState.bitmap);
			this.chunkLoaded = true;
			this.loadingCallback(false);
		} else if (msg.msg === MessageType.PartialStateUpdate) {
			const partialState = msg as PartialStateUpdateMessage;
			// console.log("Partial state update", partialState);

			const chunkIndex = Math.floor(partialState.offset / CHUNK_SIZE_BYTES);
			if (chunkIndex !== this.chunkIndex) return;
			const byteOffset = partialState.offset % CHUNK_SIZE_BYTES;

			this.bitmap.partialStateUpdate(byteOffset, partialState.chunk);
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
		} else if (msg === MessageType.Stats) {
			const currentClients = dataView.getUint32(1, true);

			return { msg, currentClients } as StatsMessage;
		} else if (msg === MessageType.ChunkFullStateResponse) {
			const chunkIndex = dataView.getUint16(1, true);
			const bitmap = payload.slice(3);

			return { msg, chunkIndex, bitmap } as ChunkFullStateResponseMessage;
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
		if (msg.msg === MessageType.ChunkFullStateRequest || msg.msg === MessageType.PartialStateSubscription) {
			const data = new Uint8Array(3);
			data[0] = msg.msg;
			const view = new DataView(data.buffer);
			view.setUint16(1, msg.chunkIndex, true);

			return data;
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
