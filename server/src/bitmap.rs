use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Arc,
};

use bitvec::array::BitArray;
use tokio::sync::broadcast;

use crate::common::PResult;

// The size of a single chunk in bits
pub const CHUNK_SIZE: usize = 64 * 64 * 64;
// The size of a single chunk in bytes
pub const CHUNK_SIZE_BYTES: usize = CHUNK_SIZE / 8;
// The number of chunks
pub const CHUNK_COUNT: usize = 64 * 64;
// The size of the entire bitmap in bits
pub const BITMAP_SIZE: usize = CHUNK_SIZE * CHUNK_COUNT;
// The size of a single update chunk in bytes
pub const UPDATE_CHUNK_SIZE: usize = 32;
// The size of a single update chunk in bits
pub const UPDATE_CHUNK_SIZE_BITS: usize = UPDATE_CHUNK_SIZE * 8;

type BitmapType = BitArray<[u8; CHUNK_SIZE_BYTES]>;

pub struct Bitmap {
    pub data: Box<[BitmapType; CHUNK_COUNT]>,
    pub change_tracker: ChangeTracker,
}

impl Bitmap {
    pub fn new() -> Self {
        let data = vec![BitArray::default(); CHUNK_COUNT]
            .into_boxed_slice()
            .try_into()
            .unwrap();
        let change_tracker = ChangeTracker::new(ChangeTrackerOptions::default());

        Self {
            data,
            change_tracker,
        }
    }

    pub fn load_from_file(&mut self, path: &str) -> PResult<()> {
        let file = std::fs::OpenOptions::new().read(true).open(path)?;
        let mut reader = std::io::BufReader::new(file);
        for chunk in self.data.iter_mut() {
            reader.read_exact(&mut chunk.data)?;
        }

        Ok(())
    }

    pub fn save_to_file(&self, path: &str) -> PResult<()> {
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        let mut writer = std::io::BufWriter::new(file);
        for chunk in self.data.iter() {
            writer.write_all(&chunk.data)?;
        }

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

        let chunk_index = index / CHUNK_SIZE;
        let bit_index = index % CHUNK_SIZE;
        let chunk = &mut self.data[chunk_index];

        chunk.set(bit_index, value);
        self.change_tracker.mark_bit_changed(index);
    }

    pub fn toggle(&mut self, index: usize) {
        self.set(index, !self.get(index));
    }

    pub fn get(&self, index: usize) -> bool {
        if index >= self.len() {
            return false;
        }

        let chunk_index = index / CHUNK_SIZE;
        let bit_index = index % CHUNK_SIZE;
        let chunk = &self.data[chunk_index];

        chunk[bit_index]
    }

    pub const fn len(&self) -> usize {
        CHUNK_SIZE * CHUNK_COUNT
    }

    pub fn as_raw_slice(&self, chunk_index: usize) -> &[u8; CHUNK_SIZE_BYTES] {
        &self.data[chunk_index].data
    }

    pub fn subscribe(&mut self, chunk_index: usize) -> broadcast::Receiver<Change> {
        self.change_tracker.subscribe_chunk(chunk_index)
    }
}

pub struct ChangeData {
    /// The offset in global byte array (chunk_index * chunk_size)
    pub byte_array_offset: u32,
    /// The changed chunk data
    pub chunk_data: [u8; UPDATE_CHUNK_SIZE],
}

pub type Change = Arc<ChangeData>;

const CHANGE_MASK_SIZE: usize =
    (CHUNK_SIZE * CHUNK_COUNT) / (UPDATE_CHUNK_SIZE * size_of::<usize>());

pub struct ChangeTrackerOptions {
    /// The maximum number of changes that can be stored in the backlog for each receiver.
    pub backlog_capacity: usize,
}

impl Default for ChangeTrackerOptions {
    fn default() -> Self {
        Self {
            backlog_capacity: 128,
        }
    }
}

/// Tracks changes to a bitmap.
/// The bitmap is divided into chunks of CHUNK_SIZE bytes.
/// The change_mask stores a boolean for each chunk, indicating whether the chunk has been modified.
/// The clients only receive the chunks that have been modified.
pub struct ChangeTracker {
    pub change_mask: Box<BitArray<[usize; CHANGE_MASK_SIZE]>>,
    pub senders: HashMap<u32, broadcast::Sender<Change>>,
    pub options: ChangeTrackerOptions,
}

impl ChangeTracker {
    pub fn new(options: ChangeTrackerOptions) -> Self {
        let change_mask: Box<[usize; CHANGE_MASK_SIZE]> = vec![0usize; CHANGE_MASK_SIZE]
            .into_boxed_slice()
            .try_into()
            .unwrap();
        // Safety: BitArray<T> is #[repr(transparent)]
        let change_mask = unsafe { std::mem::transmute(change_mask) };

        Self {
            change_mask,
            senders: HashMap::new(),
            options,
        }
    }

    pub fn mark_bit_changed(&mut self, bit_index: usize) {
        self.change_mask
            .set(bit_index / UPDATE_CHUNK_SIZE_BITS, true);
    }

    pub fn clear(&mut self) {
        self.change_mask.fill(false);
    }

    pub fn subscribe_chunk(&mut self, chunk_index: usize) -> broadcast::Receiver<Change> {
        let chunk_index = chunk_index as u32;
        if let Some(sender) = self.senders.get(&chunk_index) {
            return sender.subscribe();
        }

        let (sender, receiver) = broadcast::channel(self.options.backlog_capacity);
        self.senders.insert(chunk_index, sender);

        receiver
    }

    pub fn send_changes(&self, chunks: &[BitmapType; CHUNK_COUNT]) {
        for i in self.change_mask.iter_ones() {
            let offset_in_bits = i * UPDATE_CHUNK_SIZE_BITS;
            let chunk_index = (offset_in_bits / CHUNK_SIZE) as u32;
            let offset_within_chunk = offset_in_bits % CHUNK_SIZE;

            let sender = if let Some(sender) = self.senders.get(&chunk_index) {
                sender
            } else {
                continue;
            };

            let data = &chunks[chunk_index as usize];
            let byte_offset = offset_within_chunk / 8;
            let range = byte_offset..byte_offset + UPDATE_CHUNK_SIZE;

            let chunk_data = data.as_raw_slice()[range].try_into();
            let chunk_data = if let Ok(chunk_data) = chunk_data {
                chunk_data
            } else {
				debug_assert!(false, "Failed to convert slice to array");
                break;
            };

            let change_data = ChangeData {
                byte_array_offset: (offset_in_bits / 8) as u32,
                chunk_data,
            };
            let change = Arc::new(change_data);
            let _ = sender.send(change);
        }
    }
}
