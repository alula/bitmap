# Protocol documentation - version 1

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

The bitmap is represented as an array of bytes. Each byte represents 8 bits. The bits are stored in
LSB order, so the first bit is the least significant bit of the first byte. 

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

#### 0x01 - Stats Request (Client->Server)

```c
struct StatsRequestMessage {
    MessageType type = 0x01;
};
```

The client requests the server to send the current statistics. The server will respond with a 
`0x02 - Stats Response` message.

#### 0x02 - Stats Response (Server->Client)

```c
struct StatsResponseMessage {
    MessageType type = 0x02;
    // Number of connected clients
    uint32_t currentClients;
    // Reserved for future use
    uint8_t reserved[60];
};
```

The server responds to the client with the current statistics. This message may add more fields in
future protocol versions. It's guaranteed that the layout of the message will be backward compatible.
Any new fields will be added in the `reserved` field.

### Bitmap messages

#### 0x10 - Full State Request (Client->Server)

```c
struct FullStateRequestMessage {
    MessageType type = 0x10;
};
```

The client requests the full state of the bitmap from the server. The server will respond with a 
`0x10 - Full State Response` message.

#### 0x11 - Full State Response (Server->Client)

```c
struct FullStateResponseMessage {
    MessageType type = 0x11;
    // Size of the bitmap in bits
    uint32_t bitCount;
    // Bitmap data, packed as described above, rounded up to the nearest byte
    uint8_t bitmap[(bitCount + 7) / 8];
};
```

#### 0x12 - Partial State Update (Server->Client)

```c
struct PartialStateUpdateMessage {
    MessageType type = 0x12;
    // Offset in the byte array
    uint32_t offset;
    // Updated bitmap data
    uint8_t chunk[32];
};
```

The server periodically sends partial updates to the client. The client should update the local 
bitmap state starting from the offset with the provided data.

*If you think sending 32-byte updates is too much, consider the overhead of protocols that 
encapsulate this message :)*

#### 0x13 - Toggle bit (Client->Server)

```c
struct ToggleBitMessage {
    MessageType type = 0x13;
    // Bit index
    uint32_t index;
};
```

The client sends a message to the server to toggle the bit at the specified index. See notes above 
for the bitmap representation.