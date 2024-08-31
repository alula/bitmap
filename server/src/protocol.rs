use std::fmt::Display;

use zerocopy::{AsBytes, FromBytes, FromZeroes, Unaligned};

use crate::bitmap::{BITMAP_SIZE_BYTES, CHUNK_SIZE};

pub const PROTOCOL_VERSION_MAJOR: u16 = 1;
pub const PROTOCOL_VERSION_MINOR: u16 = 0;

#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum MessageType {
    Hello = 0x0,
    StatsRequest = 0x1,
    StatsResponse = 0x2,
    FullStateRequest = 0x10,
    FullStateResponse = 0x11,
    PartialStateUpdate = 0x12,
    ToggleBit = 0x13,
}

impl MessageType {
    pub const fn is_client_message(&self) -> bool {
        matches!(
            self,
            MessageType::StatsRequest | MessageType::FullStateRequest | MessageType::ToggleBit
        )
    }

    pub const fn is_server_message(&self) -> bool {
        matches!(
            self,
            MessageType::Hello
                | MessageType::StatsResponse
                | MessageType::FullStateResponse
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
pub struct StatsResponseMessage {
    pub current_clients: u32,
    pub reserved: [u8; 60],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct FullStateResponseMessage {
    pub bit_count: u32,
    pub bitmap: [u8; BITMAP_SIZE_BYTES],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct PartialStateUpdateMessage {
    pub offset: u32,
    pub chunk: [u8; CHUNK_SIZE],
}

#[repr(packed)]
#[derive(Debug, Clone, FromBytes, FromZeroes, AsBytes, Unaligned)]
pub struct ToggleBitMessage {
    pub index: u32,
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
    StatsRequest,
    StatsResponse(&'a StatsResponseMessage),
    FullStateRequest,
    FullStateResponse(&'a FullStateResponseMessage),
    PartialStateUpdate(&'a PartialStateUpdateMessage),
    ToggleBit(&'a ToggleBitMessage),
}

impl Message<'_> {
    pub fn id(&self) -> MessageType {
        match self {
            Message::Hello(_) => MessageType::Hello,
            Message::StatsRequest => MessageType::StatsRequest,
            Message::StatsResponse(_) => MessageType::StatsResponse,
            Message::FullStateRequest => MessageType::FullStateRequest,
            Message::FullStateResponse(_) => MessageType::FullStateResponse,
            Message::PartialStateUpdate(_) => MessageType::PartialStateUpdate,
            Message::ToggleBit(_) => MessageType::ToggleBit,
        }
    }

    /// Parses a message from a slice of bytes and if the message is valid,
    /// returns an enum variant with a reference to the message data, casted to the correct type.
    pub fn from_slice(slice: &[u8]) -> Result<Message, ProtocolError> {
        if slice.len() < 1 {
            return Err(ProtocolError::InvalidMessageSize);
        }

        let id = slice[0];

        macro_rules! message_handler_ref {
            ($name:ident, $message:ty) => {{
                let array_ref = <&[u8; std::mem::size_of::<$message>()]>::try_from(&slice[1..])
                    .map_err(|_| ProtocolError::InvalidMessageSize)?;

                let message = zerocopy::transmute_ref!(array_ref);
                Ok(Message::$name(message))
            }};
        }

        match id {
            x if x == MessageType::Hello as u8 => message_handler_ref!(Hello, HelloMessage),
            x if x == MessageType::StatsRequest as u8 => Ok(Message::StatsRequest),
            x if x == MessageType::StatsResponse as u8 => {
                message_handler_ref!(StatsResponse, StatsResponseMessage)
            }
            x if x == MessageType::FullStateRequest as u8 => Ok(Message::FullStateRequest),
            x if x == MessageType::FullStateResponse as u8 => {
                message_handler_ref!(FullStateResponse, FullStateResponseMessage)
            }
            x if x == MessageType::PartialStateUpdate as u8 => {
                message_handler_ref!(PartialStateUpdate, PartialStateUpdateMessage)
            }
            x if x == MessageType::ToggleBit as u8 => {
                message_handler_ref!(ToggleBit, ToggleBitMessage)
            }
            _ => Err(ProtocolError::InvalidMessageId),
        }
    }
}

pub enum MessageMut<'a> {
    Hello(&'a mut HelloMessage),
    StatsRequest,
    StatsResponse(&'a mut StatsResponseMessage),
    FullStateRequest,
    FullStateResponse(&'a mut FullStateResponseMessage),
    PartialStateUpdate(&'a mut PartialStateUpdateMessage),
    ToggleBit(&'a mut ToggleBitMessage),
}

impl MessageMut<'_> {
    pub fn id(&self) -> MessageType {
        match self {
            MessageMut::Hello(_) => MessageType::Hello,
            MessageMut::StatsRequest => MessageType::StatsRequest,
            MessageMut::StatsResponse(_) => MessageType::StatsResponse,
            MessageMut::FullStateRequest => MessageType::FullStateRequest,
            MessageMut::FullStateResponse(_) => MessageType::FullStateResponse,
            MessageMut::PartialStateUpdate(_) => MessageType::PartialStateUpdate,
            MessageMut::ToggleBit(_) => MessageType::ToggleBit,
        }
    }

    /// Parses a client message from a mutable slice of bytes and if the message is valid,
    /// returns an enum variant with a reference to the message data, casted to the correct type.
    pub fn from_slice(slice: &mut [u8]) -> Result<MessageMut, ProtocolError> {
        if slice.len() < 1 {
            return Err(ProtocolError::InvalidMessageSize);
        }

        let id = slice[0];

        macro_rules! message_handler_mut {
            ($name:ident, $message:ty) => {{
                let array_ref =
                    <&mut [u8; std::mem::size_of::<$message>()]>::try_from(&mut slice[1..])
                        .map_err(|_| ProtocolError::InvalidMessageSize)?;

                let message = zerocopy::transmute_mut!(array_ref);
                Ok(MessageMut::$name(message))
            }};
        }

        match id {
            x if x == MessageType::Hello as u8 => message_handler_mut!(Hello, HelloMessage),
            x if x == MessageType::StatsRequest as u8 => Ok(MessageMut::StatsRequest),
            x if x == MessageType::StatsResponse as u8 => {
                message_handler_mut!(StatsResponse, StatsResponseMessage)
            }
            x if x == MessageType::FullStateRequest as u8 => Ok(MessageMut::FullStateRequest),
            x if x == MessageType::FullStateResponse as u8 => {
                message_handler_mut!(FullStateResponse, FullStateResponseMessage)
            }
            x if x == MessageType::PartialStateUpdate as u8 => {
                message_handler_mut!(PartialStateUpdate, PartialStateUpdateMessage)
            }
            x if x == MessageType::ToggleBit as u8 => {
                message_handler_mut!(ToggleBit, ToggleBitMessage)
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
            MessageType::Hello => std::mem::size_of::<HelloMessage>(),
            MessageType::StatsRequest => 0,
            MessageType::StatsResponse => std::mem::size_of::<StatsResponseMessage>(),
            MessageType::FullStateRequest => 0,
            MessageType::FullStateResponse => std::mem::size_of::<FullStateResponseMessage>(),
            MessageType::PartialStateUpdate => std::mem::size_of::<PartialStateUpdateMessage>(),
            _ => return Err(ProtocolError::InvalidMessageId),
        };
        buffer.clear();
        buffer.resize(size + 1, 0);
        buffer[0] = id as u8;

        Self::from_slice(&mut buffer[..])
    }
}

pub fn is_valid_client_message_id(id: u8) -> bool {
    match id {
        x if x == MessageType::StatsRequest as u8 => true,
        x if x == MessageType::FullStateRequest as u8 => true,
        x if x == MessageType::ToggleBit as u8 => true,
        _ => false,
    }
}

pub fn is_valid_server_message_id(id: u8) -> bool {
    match id {
        x if x == MessageType::Hello as u8 => true,
        x if x == MessageType::StatsResponse as u8 => true,
        x if x == MessageType::FullStateResponse as u8 => true,
        x if x == MessageType::PartialStateUpdate as u8 => true,
        _ => false,
    }
}
