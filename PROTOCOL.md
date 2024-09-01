# Protocol documentation - version 1.0

## Introduction

We use WebSockets to communicate between the server and the client. The protocol is binary in both 
directions, the message format is as follows:

```cpp
using MessageType = uint8_t;

struct Message {
	MessageType type;
	uint8_t data[VARIABLE];
};
```

The message type is a single byte that indicates the type of the message.

The message data length is variable, there's no length specifier, as that matter is handled by the 
WebSocket protocol.

Every value larger than a byte is sent in little-endian order.

There is no padding in the messages, so the data is packed as tightly as possible. Similar to 
`__attribute__(packed)` or `#pragma pack(1)` in C or `#[repr(packed)]` in Rust.

## Bitmap representation

The bitmap is represented an array of bytes. The bits are stored in LSB order, so the first bit is 
the least significant bit of the first byte. 

The bit numbering starts from 0.

For example, the following bitmap:

```
00 01 80
```

Would be represented as:

```
MSB  LSB MSB  LSB MSB  LSB
7      0 7      0 7      0
|      | |      | |      |
00000000 00000001 10000000
```

The size of entire bitmap is 1024³ bits, which is 1 Gibibit or 128 MiB.

For performance reasons the full bitmap is not accessible at once, but, it's divided into 
4096 (64²) chunks, each containing 262144 (64³) bits. The chunks are numbered from 0 to 4095.

The constants are defined as follows:

```cpp
// The size of a single chunk in bits
const uint32_t CHUNK_SIZE = 64 * 64 * 64;

// The size of a single chunk in bytes
const uint32_t CHUNK_SIZE_BYTES = CHUNK_SIZE / 8;

// The number of chunks
const uint32_t CHUNK_COUNT = 64 * 64;

// The size of the entire bitmap in bits
const uint32_t BITMAP_SIZE = CHUNK_SIZE * CHUNK_COUNT;

// The size of a single update chunk in bytes
const uint32_t UPDATE_CHUNK_SIZE = 32;
```

## Message types

### System messages

#### 0x00 - Hello (Server->Client)

```c
struct HelloMessage {
	MessageType type = 0x00;
	// Protocol version (expected to be 1)
	uint16_t versionMajor;
	// Minor protocol version
	uint16_t versionMinor;
};
```

The server sends a hello message to the client when the connection is established. The specified 
major protocol version is equivalent to the version of this document.

Subsequent major protocol versions may introduce breaking changes, so the client should check the 
version and disconnect if it's not supported.

#### 0x01 - Stats (Server->Client)

```c
struct StatsMessage {
	MessageType type = 0x01;
	// Number of connected clients
	uint32_t currentClients;
	// Reserved for future use
	uint8_t reserved[60];
};
```

The server periodically send the current statistics to the client. This message may add more fields 
in future protocol versions. It's guaranteed that the layout of the message will be backward 
compatible. Any new fields will be added in the `reserved` field.

### Bitmap messages

#### 0x10 - Chunk Full State Request (Client->Server)

```c
struct FullStateRequestMessage {
	MessageType type = 0x10;
	uint16_t chunkIndex;
};
```

The client requests the full state of a specified chunk from the server. 

The `chunkIndex` is a number from 0 to 4095.

The server will respond with a `0x11 - Chunk Full State Response` message.

This message is stateless, you can request the full state of any chunk at any time.

#### 0x11 - Chunk Full State Response (Server->Client)

```c
struct ChunkFullStateResponseMessage {
	MessageType type = 0x11;
	// Index of the chunk
	uint16_t chunkIndex;
	// Chunk bitmap data, represented as described previously in the document
	uint8_t bitmap[CHUNK_SIZE_BYTES];
};
```

#### 0x12 - Partial State Update (Server->Client)

```c
struct PartialStateUpdateMessage {
	MessageType type = 0x12;
	// Byte offset in the global byte array (chunk index * CHUNK_SIZE)
	uint32_t offset;
	// Updated bitmap data
	uint8_t chunk[UPDATE_CHUNK_SIZE];
};
```

The server periodically sends partial updates of the subscribed chunk to the client. 
The client should update the local bitmap state starting from the offset with the provided data.

The offset is the index of the byte in the bitmap viewed as a whole. The index and chunk index can
be calculated as follows:

```cpp
uint32_t chunkIndex = offset / CHUNK_SIZE_BYTES;
uint32_t byteIndex = offset % CHUNK_SIZE_BYTES;
```

The bitmap data is updated as follows:

```cpp
// getChunkDataAt is a function that returns a mutable byte array view of the chunk the client is 
// subscribed to
uint8_t* chunkData = getChunkDataAt(chunkIndex);

for (uint32_t i = 0; i < UPDATE_CHUNK_SIZE; i++) {
	chunkData[byteIndex + i] = message.chunk[i];
}
```

*If you think sending 32-byte updates is too much, consider the overhead of protocols that 
encapsulate this message :)*

#### 0x13 - Toggle bit (Client->Server)

```c
struct ToggleBitMessage {
	MessageType type = 0x13;
	// Bit index in the global bitmap
	uint32_t index;
};
```

Requests the server to toggle the specified bit in the global bitmap. 

The bit index is a number from 0 to 1024³, it's viewed as an index of the bit in the bitmap viewed 
as a whole. The indices can be calculated as follows:

```cpp
uint32_t chunkIndex = index / CHUNK_SIZE;
uint32_t bitIndexInChunk = index % CHUNK_SIZE;
```

#### 0x14 - Partial State Subscription (Client->Server)

```c
struct PartialStateSubscriptionMessage {
	MessageType type = 0x14;
	// Chunk index
	uint16_t chunkIndex;
};
```

The client sends a message to the server to subscribe to partial updates of the specified chunk.

The server does not send partial updates to the client if the client is not subscribed to the chunk.

The client can only subscribe to a single chunk at a time. If the client sends another 
`0x14 - Partial State Subscription` message, the server will unsubscribe the client from the 
previous chunk and subscribe to the new one.

## Connection flow example

```

Client                         Server
  |                               |
  | WebSocket handshake           |
  |-----------------------------> |
  |                               |
  | 0x00 Hello                    |
  | <-----------------------------|
  |                               |
  | 0x10 Chunk Full State Request |
  |-----------------------------> |
  |                               |
  | 0x14 Partial State Sub        |
  |-----------------------------> |
  |                               |
  | 0x11 Chunk Full State Response|
  | <-----------------------------|
  |                               |
  | 0x12 Partial State Update     |
  | <-----------------------------|
  |                               |
  | 0x12 Partial State Update     |
  | <-----------------------------|
  |                               |
  | 0x01 Stats                    |
  | <-----------------------------|
  |                               |
  | 0x12 Partial State Update     |
  | <-----------------------------|
  |                               |
  | 0x13 Toggle bit               |
  |-----------------------------> |
  |                               |
  | 0x12 Partial State Update     |
  | <-----------------------------|
  |                               |
  | 0x14 Partial State Sub        |
  |-----------------------------> |
  |                               |
  | 0x10 Chunk Full State Request |
  |-----------------------------> |
  |                               |
  | 0x11 Chunk Full State Response|
  | <-----------------------------|
  |                               |
  | 0x12 Partial State Update     |
  | <-----------------------------|

```
