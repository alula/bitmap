use std::{
    io::{Read, Write},
    sync::Arc,
};

use bitvec::array::BitArray;
use tokio::sync::broadcast;

use crate::common::PResult;

pub const BITMAP_SIZE: usize = 1024 * 1024;
pub const BITMAP_SIZE_BYTES: usize = BITMAP_SIZE / 8;
pub const CHUNK_SIZE: usize = 32;
pub const CHUNK_SIZE_BITS: usize = CHUNK_SIZE * 8;

type BitmapType = BitArray<[u8; BITMAP_SIZE_BYTES]>;

pub struct Bitmap {
    pub data: Box<BitmapType>,
    pub change_tracker: ChangeTracker,
}

impl Bitmap {
    pub fn new() -> Self {
        let data = Box::new(BitArray::new([0; BITMAP_SIZE_BYTES]));
        let change_tracker = ChangeTracker::new();

        Self {
            data,
            change_tracker,
        }
    }

    pub fn load_from_file(&mut self, path: &str) -> PResult<()> {
        let file = std::fs::OpenOptions::new().read(true).open(path)?;
        let mut reader = std::io::BufReader::new(file);
        reader.read_exact(&mut self.data.data)?;

        Ok(())
    }

    pub fn save_to_file(&self, path: &str) -> PResult<()> {
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        let mut writer = std::io::BufWriter::new(file);
        writer.write_all(&self.data.data)?;

        Ok(())
    }

    pub fn periodic_send_changes(&mut self) {
        self.change_tracker.send_changes(&self.data);
        self.change_tracker.clear();
    }

    pub fn set(&mut self, index: usize, value: bool) {
        if index >= self.len() {
            return;
        }

        self.data.set(index, value);
        self.change_tracker
            .mark_chunk_changed(index / CHUNK_SIZE_BITS);
    }

    pub fn toggle(&mut self, index: usize) {
        if index >= self.len() {
            return;
        }

        self.set(index, !self.get(index));
    }

    pub fn get(&self, index: usize) -> bool {
        if index >= self.len() {
            return false;
        }

        self.data[index]
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn as_raw_slice(&self) -> &[u8; BITMAP_SIZE_BYTES] {
        &self.data.data
    }

    pub fn as_raw_mut_slice(&mut self) -> &mut [u8; BITMAP_SIZE_BYTES] {
        &mut self.data.data
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Change> {
        self.change_tracker.sender.subscribe()
    }
}

pub struct ChangeData {
    pub byte_array_offset: u32,
    pub chunk_data: [u8; CHUNK_SIZE],
}

pub type Change = Arc<ChangeData>;

const CHANGE_MASK_SIZE: usize = BITMAP_SIZE / (CHUNK_SIZE * size_of::<usize>());

/// Tracks changes to a bitmap.
/// The bitmap is divided into chunks of CHUNK_SIZE bytes.
/// The change_mask stores a boolean for each chunk, indicating whether the chunk has been modified.
/// The clients only receive the chunks that have been modified.
pub struct ChangeTracker {
    pub change_mask: Box<BitArray<[usize; CHANGE_MASK_SIZE]>>,
    pub sender: broadcast::Sender<Change>,
}

impl ChangeTracker {
    pub fn new() -> Self {
        let sender = broadcast::Sender::new(128);

        Self {
            change_mask: Box::new(BitArray::new([0usize; CHANGE_MASK_SIZE])),
            sender,
        }
    }

    pub fn mark_chunk_changed(&mut self, chunk_index: usize) {
        self.change_mask.set(chunk_index, true);
    }

    pub fn clear(&mut self) {
        self.change_mask.fill(false);
    }

    pub fn send_changes(&self, data: &BitmapType) {
        for i in self.change_mask.iter_ones() {
            let offset = i * CHUNK_SIZE;
            let chunk_data = data.as_raw_slice()[offset..offset + CHUNK_SIZE].try_into();
            let chunk_data = if let Ok(chunk_data) = chunk_data {
                chunk_data
            } else {
                break;
            };

            let change_data = ChangeData {
                byte_array_offset: offset as u32,
                chunk_data,
            };
            let change = Arc::new(change_data);
            let _ = self.sender.send(change);
        }
    }
}
