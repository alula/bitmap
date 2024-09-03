use std::fmt::Display;

use zerocopy::{AsBytes, FromBytes, FromZeroes, Unaligned};

use crate::bitmap::{CHUNK_SIZE_BYTES, UPDATE_CHUNK_SIZE};

pub const PROTOCOL_VERSION_MAJOR: u16 = 1;
pub const PROTOCOL_VERSION_MINOR: u16 = 1;

#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum MessageType {
    Hello = 0x0,
    Stats = 0x1,
    ChunkFullStateRequest = 0x10,
    ChunkFullStateResponse = 0x11,
    PartialStateUpdate = 0x12,
    ToggleBit = 0x13,
    PartialStateSubscription = 0x14,
    PartialStateUnsubscription = 0x15,
}

impl MessageType {
    pub const fn is_client_message(&self) -> bool {
        matches!(
            self,
            MessageType::ChunkFullStateRequest
                | MessageType::ToggleBit
                | MessageType::PartialStateSubscription
                | MessageType::PartialStateUnsubscription
        )
    }

    pub const fn is_server_message(&self) -> bool {
        matches!(
            self,
            MessageType::Hello
                | MessageType::Stats
                | MessageType::ChunkFullStateResponse
                | MessageType::PartialStateUpdate
        )
    }
}

#[cfg(not(target_endian = "little"))]
compile_error!("This code below is only intended to run on little-endian architectures");

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct HelloMessage {
    pub version_major: u16,
    pub version_minor: u16,
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct StatsMessage {
    pub current_clients: u32,
    pub reserved: [u8; 60],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct ChunkFullStateRequestMessage {
    pub chunk_index: u16,
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct ChunkFullStateResponseMessage {
    pub chunk_index: u16,
    pub bitmap: [u8; CHUNK_SIZE_BYTES],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct PartialStateUpdateMessage {
    pub offset: u32,
    pub chunk: [u8; UPDATE_CHUNK_SIZE],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct ToggleBitMessage {
    pub index: u32,
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct PartialStateSubscriptionMessage {
    pub chunk_index: u16,
}

#[derive(Debug, Clone)]
pub enum ProtocolError {
    InvalidMessageId,
    InvalidMessageSize,
    InvalidMessageVersion,
}

impl Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ProtocolError::InvalidMessageId => write!(f, "Invalid message ID"),
            ProtocolError::InvalidMessageSize => write!(f, "Invalid message size"),
            ProtocolError::InvalidMessageVersion => write!(f, "Invalid message version"),
        }
    }
}

impl std::error::Error for ProtocolError {}

pub enum Message<'a> {
    Hello(&'a HelloMessage),
    Stats(&'a StatsMessage),
    ChunkFullStateRequest(&'a ChunkFullStateRequestMessage),
    ChunkFullStateResponse(&'a ChunkFullStateResponseMessage),
    PartialStateUpdate(&'a PartialStateUpdateMessage),
    ToggleBit(&'a ToggleBitMessage),
    PartialStateSubscription(&'a PartialStateSubscriptionMessage),
    PartialStateUnsubscription,
}

impl Message<'_> {
    pub fn id(&self) -> MessageType {
        match self {
            Message::Hello(_) => MessageType::Hello,
            Message::Stats(_) => MessageType::Stats,
            Message::ChunkFullStateRequest(_) => MessageType::ChunkFullStateRequest,
            Message::ChunkFullStateResponse(_) => MessageType::ChunkFullStateResponse,
            Message::PartialStateUpdate(_) => MessageType::PartialStateUpdate,
            Message::ToggleBit(_) => MessageType::ToggleBit,
            Message::PartialStateSubscription(_) => MessageType::PartialStateSubscription,
            Message::PartialStateUnsubscription => MessageType::PartialStateUnsubscription,
        }
    }

    /// Parses a message from a slice of bytes and if the message is valid,
    /// returns an enum variant with a reference to the message data, casted to the correct type.
    pub fn from_slice(slice: &[u8]) -> Result<Message, ProtocolError> {
        if slice.len() < 1 {
            return Err(ProtocolError::InvalidMessageSize);
        }

        let id = slice[0];

        macro_rules! message_handler {
            ($name:ident, $message:ty) => {{
                let array_ref = <&[u8; std::mem::size_of::<$message>()]>::try_from(&slice[1..])
                    .map_err(|_| ProtocolError::InvalidMessageSize)?;

                let message = zerocopy::transmute_ref!(array_ref);
                Ok(Message::$name(message))
            }};
        }

        match id {
            x if x == MessageType::Hello as u8 => message_handler!(Hello, HelloMessage),
            x if x == MessageType::Stats as u8 => {
                message_handler!(Stats, StatsMessage)
            }
            x if x == MessageType::ChunkFullStateRequest as u8 => {
                message_handler!(ChunkFullStateRequest, ChunkFullStateRequestMessage)
            }
            x if x == MessageType::ChunkFullStateResponse as u8 => {
                message_handler!(ChunkFullStateResponse, ChunkFullStateResponseMessage)
            }
            x if x == MessageType::PartialStateUpdate as u8 => {
                message_handler!(PartialStateUpdate, PartialStateUpdateMessage)
            }
            x if x == MessageType::ToggleBit as u8 => {
                message_handler!(ToggleBit, ToggleBitMessage)
            }
            x if x == MessageType::PartialStateSubscription as u8 => {
                message_handler!(PartialStateSubscription, PartialStateSubscriptionMessage)
            }
            x if x == MessageType::PartialStateUnsubscription as u8 => {
                Ok(Message::PartialStateUnsubscription)
            }
            _ => Err(ProtocolError::InvalidMessageId),
        }
    }
}

pub enum MessageMut<'a> {
    Hello(&'a mut HelloMessage),
    Stats(&'a mut StatsMessage),
    ChunkFullStateRequest(&'a mut ChunkFullStateRequestMessage),
    ChunkFullStateResponse(&'a mut ChunkFullStateResponseMessage),
    PartialStateUpdate(&'a mut PartialStateUpdateMessage),
    ToggleBit(&'a mut ToggleBitMessage),
    PartialStateSubscription(&'a mut PartialStateSubscriptionMessage),
    PartialStateUnsubscription,
}

impl MessageMut<'_> {
    pub fn id(&self) -> MessageType {
        match self {
            MessageMut::Hello(_) => MessageType::Hello,
            MessageMut::Stats(_) => MessageType::Stats,
            MessageMut::ChunkFullStateRequest(_) => MessageType::ChunkFullStateRequest,
            MessageMut::ChunkFullStateResponse(_) => MessageType::ChunkFullStateResponse,
            MessageMut::PartialStateUpdate(_) => MessageType::PartialStateUpdate,
            MessageMut::ToggleBit(_) => MessageType::ToggleBit,
            MessageMut::PartialStateSubscription(_) => MessageType::PartialStateSubscription,
            MessageMut::PartialStateUnsubscription => MessageType::PartialStateUnsubscription,
        }
    }

    /// Parses a client message from a mutable slice of bytes and if the message is valid,
    /// returns an enum variant with a reference to the message data, casted to the correct type.
    pub fn from_slice(slice: &mut [u8]) -> Result<MessageMut, ProtocolError> {
        if slice.len() < 1 {
            return Err(ProtocolError::InvalidMessageSize);
        }

        let id = slice[0];

        macro_rules! message_handler {
            ($name:ident, $message:ty) => {{
                let array_ref =
                    <&mut [u8; std::mem::size_of::<$message>()]>::try_from(&mut slice[1..])
                        .map_err(|_| ProtocolError::InvalidMessageSize)?;

                let message = zerocopy::transmute_mut!(array_ref);
                Ok(MessageMut::$name(message))
            }};
        }

        match id {
            x if x == MessageType::Hello as u8 => message_handler!(Hello, HelloMessage),
            x if x == MessageType::Stats as u8 => {
                message_handler!(Stats, StatsMessage)
            }
            x if x == MessageType::ChunkFullStateRequest as u8 => {
                message_handler!(ChunkFullStateRequest, ChunkFullStateRequestMessage)
            }
            x if x == MessageType::ChunkFullStateResponse as u8 => {
                message_handler!(ChunkFullStateResponse, ChunkFullStateResponseMessage)
            }
            x if x == MessageType::PartialStateUpdate as u8 => {
                message_handler!(PartialStateUpdate, PartialStateUpdateMessage)
            }
            x if x == MessageType::ToggleBit as u8 => {
                message_handler!(ToggleBit, ToggleBitMessage)
            }
            x if x == MessageType::PartialStateSubscription as u8 => {
                message_handler!(PartialStateSubscription, PartialStateSubscriptionMessage)
            }
            x if x == MessageType::PartialStateUnsubscription as u8 => {
                Ok(MessageMut::PartialStateUnsubscription)
            }
            _ => Err(ProtocolError::InvalidMessageId),
        }
    }

    /// Clears the buffer and creates a message of the given type, returns an enum variant with
    /// a reference to the message data, casted to the correct type.
    pub fn create_message(
        id: MessageType,
        buffer: &mut Vec<u8>,
    ) -> Result<MessageMut, ProtocolError> {
        let size = match id {
            MessageType::Hello => size_of::<HelloMessage>(),
            MessageType::Stats => size_of::<StatsMessage>(),
            MessageType::ChunkFullStateRequest => size_of::<ChunkFullStateRequestMessage>(),
            MessageType::ChunkFullStateResponse => size_of::<ChunkFullStateResponseMessage>(),
            MessageType::PartialStateUpdate => size_of::<PartialStateUpdateMessage>(),
            MessageType::ToggleBit => size_of::<ToggleBitMessage>(),
            MessageType::PartialStateSubscription => size_of::<PartialStateSubscriptionMessage>(),
            MessageType::PartialStateUnsubscription => 0,
        };
        buffer.clear();
        buffer.resize(size + 1, 0);
        buffer[0] = id as u8;

        Self::from_slice(&mut buffer[..])
    }
}

pub fn is_valid_client_message_id(id: u8) -> bool {
    match id {
        x if x == MessageType::ChunkFullStateRequest as u8 => true,
        x if x == MessageType::ToggleBit as u8 => true,
        x if x == MessageType::PartialStateSubscription as u8 => true,
        x if x == MessageType::PartialStateUnsubscription as u8 => true,
        _ => false,
    }
}

pub fn is_valid_server_message_id(id: u8) -> bool {
    match id {
        x if x == MessageType::Hello as u8 => true,
        x if x == MessageType::Stats as u8 => true,
        x if x == MessageType::ChunkFullStateResponse as u8 => true,
        x if x == MessageType::PartialStateUpdate as u8 => true,
        _ => false,
    }
}
