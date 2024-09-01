// u8 -> number of 1s LUT
const bitCountLUT = [...Array(256)].map((r = 0, a) => {
	for (; a; a >>= 1) r += 1 & a;
	return r;
});

function countOnes(array: Uint8Array) {
	let count = 0;
	for (let i = 0; i < array.length; i++) {
		count += bitCountLUT[array[i]];
	}
	return count;
}

type BitmapChangeCallback = (min: number, max: number) => void;

export class Bitmap {
	checkedCount = 0;

	public bytes: Uint8Array;
	private subscribers: Set<BitmapChangeCallback> = new Set();

	constructor(public bitCount: number) {
		const byteCount = Math.ceil(bitCount / 8);
		this.bytes = new Uint8Array(byteCount);
	}

	get(index: number) {
		const byteIndex = index >> 3;
		const bitIndex = index & 7;
		return (this.bytes[byteIndex] & (1 << bitIndex)) !== 0;
	}

	set(index: number, value: boolean) {
		const byteIndex = index >> 3;
		const bitIndex = index & 7;

		let b = this.bytes[byteIndex];
		this.checkedCount -= bitCountLUT[b];

		b &= ~(1 << bitIndex);

		if (value) {
			b |= 1 << bitIndex;
		}

		this.bytes[byteIndex] = b;
		this.checkedCount += bitCountLUT[b];
	}

	fullStateUpdate(bitmap: Uint8Array) {
		this.bytes.set(bitmap);
		this.checkedCount = countOnes(bitmap);
		this.fireChange();
	}

	partialStateUpdate(offset: number, chunk: Uint8Array) {
		for (let i = 0; i < chunk.length; i++) {
			const byteIndex = offset + i;
			const b = this.bytes[byteIndex];
			this.checkedCount -= bitCountLUT[b];
			this.bytes[byteIndex] = chunk[i];
			this.checkedCount += bitCountLUT[chunk[i]];
		}
		this.fireChange(offset * 8, (offset + chunk.length) * 8);
	}

	fireChange(rangeMin: number = 0, rangeMax: number = this.bitCount) {
		for (const subscriber of this.subscribers) {
			subscriber(rangeMin, rangeMax);
		}
	}

	subscribeToChanges(callback: BitmapChangeCallback) {
		this.subscribers.add(callback);
	}

	unsubscribeFromChanges(callback: BitmapChangeCallback) {
		this.subscribers.delete(callback);
	}
}
