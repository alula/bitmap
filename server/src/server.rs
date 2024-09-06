use crate::{
    bitmap::{Bitmap, Change},
    common::{PResult, METRICS_PATH, STATE_PATH},
    config::Settings,
    protocol::{Message, MessageMut, MessageType, PROTOCOL_VERSION_MAJOR, PROTOCOL_VERSION_MINOR},
};
use futures_util::AsyncWriteExt;
use serde::{Deserialize, Serialize};
use signal_hook::consts::{SIGINT, SIGQUIT, SIGTERM};
use signal_hook_tokio::Signals;
use soketto::{
    extension::deflate::Deflate,
    handshake::{server::Response, Server},
    Data,
};
use std::{
    io,
    net::IpAddr,
    str::FromStr,
    sync::{
        atomic::{AtomicU32, AtomicU64, Ordering},
        Arc,
    },
};
use tokio::{
    net::TcpStream,
    sync::{broadcast, mpsc, Mutex, RwLock},
    task::{JoinHandle, JoinSet},
};
use tokio_stream::{wrappers::TcpListenerStream, StreamExt};
use tokio_util::compat::{Compat, TokioAsyncReadCompatExt};

pub struct BitmapServer {
    ctx: Arc<SharedServerContext>,
}

struct SharedServerContext {
    settings: Settings,
    bitmap: RwLock<Bitmap>,
    metrics: Arc<Metrics>,
    client_id_counter: AtomicU64,
}

#[derive(Debug, Clone, Copy)]
enum ClientTaskMessage {
    Subscribe { chunk: u16 },
    UnsubscribeAll,
    SendStats,
}

impl BitmapServer {
    pub fn new(settings: Settings) -> Box<Self> {
        let mut bitmap = Bitmap::new();
        match bitmap.load_from_file(STATE_PATH) {
            Ok(_) => log::info!("Loaded bitmap state from file"),
            Err(e) => log::warn!("Failed to load bitmap state from file: {}", e),
        }

        let metrics = match Metrics::load_from_file(METRICS_PATH) {
            Ok(m) => Arc::new(m),
            Err(_) => Arc::new(Metrics::default()),
        };

        metrics.set_checked_bits(bitmap.count_ones() as u32);

        let ctx = Arc::new(SharedServerContext {
            settings,
            bitmap: RwLock::new(bitmap),
            metrics,
            client_id_counter: AtomicU64::new(0),
        });

        Box::new(Self { ctx })
    }

    pub async fn run(&self) -> PResult<()> {
        let net_task = Self::net_task(self.ctx.clone());
        let bitmap_task = Self::bitmap_task(self.ctx.clone());
        let save_task = Self::save_task(self.ctx.clone());

        let mut join_set = JoinSet::new();
        join_set.spawn(async move { net_task.await });
        join_set.spawn(async move { bitmap_task.await });
        join_set.spawn(async move { save_task.await });

        let ctx = self.ctx.clone();
        tokio::spawn(async move {
            let mut signals = Signals::new(&[SIGINT, SIGTERM, SIGQUIT]).unwrap();
            let handle = signals.handle();

            while let Some(signal) = signals.next().await {
                log::info!("Quitting due to signal {}", signal);
                break;
            }

            handle.close();

            Self::do_save(&ctx).await;

            std::process::exit(0);
        });

        while let Some(result) = join_set.join_next().await {
            result??;
        }

        Ok(())
    }

    async fn bitmap_task(ctx: Arc<SharedServerContext>) -> PResult<()> {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            {
                ctx.bitmap.write().await.periodic_send_changes();
            }
        }
    }

    async fn save_task(ctx: Arc<SharedServerContext>) -> PResult<()> {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(600)).await;
            Self::do_save(&ctx).await;
        }
    }

    async fn do_save(ctx: &Arc<SharedServerContext>) {
        if let Err(e) = ctx.metrics.save_to_file(METRICS_PATH) {
            log::error!("Failed to save metrics: {}", e);
        } else {
            log::info!("Metrics saved.");
        }

        if let Err(e) = ctx.bitmap.write().await.save_to_file(STATE_PATH) {
            log::error!("Failed to save state: {}", e);
        } else {
            log::info!("State saved.");
        }
    }

    async fn net_task(ctx: Arc<SharedServerContext>) -> PResult<()> {
        let listener = tokio::net::TcpListener::bind(&ctx.settings.bind_address).await?;
        log::info!("Server running on {}", listener.local_addr()?);

        let mut incoming = TcpListenerStream::new(listener);

        while let Some(socket) = incoming.next().await {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let client_id = ctx.client_id_counter.fetch_add(1, Ordering::Relaxed);
                ctx.metrics.inc_clients();

                let result = Self::client_task(client_id, socket, &ctx).await;
                if let Err(e) = result {
                    log::error!("[Client{}] Task error: {}", client_id, e);
                }

                log::debug!("[Client{}] Task finished", client_id);

                ctx.metrics.dec_clients();
            });
        }

        Ok(())
    }

    async fn client_task(
        client_id: u64,
        socket: io::Result<TcpStream>,
        ctx: &Arc<SharedServerContext>,
    ) -> PResult<()> {
        let socket = socket?;
        let peer_addr = socket.peer_addr().ok();
        let mut server = Server::new(socket.compat());

        if ctx.settings.ws_permessage_deflate {
            let mut deflate = Box::new(Deflate::new(soketto::Mode::Server));
            deflate.set_max_buffer_size(512 * 1024);
            server.add_extension(deflate);
        }

        let websocket_key = {
            let req = server.receive_request().await;
            let req = match req {
                Ok(req) => req,
                Err(_) => {
                    return Self::try_handle_as_http(ctx, server).await;
                }
            };
            req.key()
        };

        let ip = peer_addr.map(|addr| addr.ip());
        let ip = if ctx.settings.parse_proxy_headers {
            Self::get_ip_from_proxy_headers(&mut server)?.or(ip)
        } else {
            ip
        };

        if let Some(ip) = ip {
            log::info!("[Client{}] New connection from {}", client_id, ip);
        }

        let accept = Response::Accept {
            key: websocket_key,
            protocol: None,
        };
        server.send_response(&accept).await?;

        let mut builder = server.into_builder();
        builder.set_max_message_size(512 * 1024);
        builder.set_max_message_size(512 * 1024);
        let (mut sender, mut receiver) = builder.finish();

        let mut send_data = Vec::new();
        let mut recv_data = Vec::new();

        {
            let hello = MessageMut::create_message(MessageType::Hello, &mut send_data)?;
            if let MessageMut::Hello(hello) = hello {
                hello.version_major = PROTOCOL_VERSION_MAJOR;
                hello.version_minor = PROTOCOL_VERSION_MINOR;
            }

            sender.send_binary(&send_data).await?;
        }

        let sender = Arc::new(Mutex::new(sender));
        let (ctm_sender, mut ctm_receiver) = mpsc::channel::<ClientTaskMessage>(8);

        let mut recv_task: JoinHandle<PResult<()>> = {
            let ctx = ctx.clone();
            let sender = sender.clone();
            let ctm_sender = ctm_sender.clone();
            tokio::spawn(async move {
                let mut send_data = Vec::new();

                loop {
                    let data_type = receiver.receive_data(&mut recv_data).await?;

                    BitmapServer::client_task_receive(
                        &ctx,
                        data_type,
                        &recv_data,
                        &mut send_data,
                        &ctm_sender,
                    )
                    .await?;

                    if !send_data.is_empty() {
                        sender.lock().await.send_binary(&send_data).await?;
                    }

                    recv_data.clear();
                }
            })
        };

        let mut stats_task: JoinHandle<PResult<()>> = {
            let ctm_sender = ctm_sender.clone();
            tokio::spawn(async move {
                loop {
                    ctm_sender.send(ClientTaskMessage::SendStats).await?;
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            })
        };

        let mut update_receiver = None;

        async fn cond_recv_update(
            receiver: &mut Option<broadcast::Receiver<Change>>,
        ) -> Option<Change> {
            if let Some(receiver) = receiver {
                receiver.recv().await.ok()
            } else {
                std::future::pending().await
            }
        }

        loop {
            // log::info!("[Client{}] Client task loop", client_id);
            tokio::select! {
                res = &mut recv_task => {
                    sender.lock().await.close().await?;
                    return res?;
                }
                res = &mut stats_task => {
                    return res?;
                }
                msg = cond_recv_update(&mut update_receiver) => {
                    if let Some(msg) = msg {
                        let psu = MessageMut::create_message(MessageType::PartialStateUpdate, &mut send_data)?;
                        if let MessageMut::PartialStateUpdate(psu) = psu {
                            psu.offset = msg.byte_array_offset;
                            psu.chunk = msg.chunk_data;
                        }

                        sender.lock().await.send_binary(&send_data).await?;
                    }
                }
                msg = ctm_receiver.recv() => {
                    if let Some(ClientTaskMessage::Subscribe { chunk }) = msg {
                        log::debug!("[Client{}] Received subscribe message for chunk {}", client_id, chunk);
                        let mut bitmap = ctx.bitmap.write().await;
                        update_receiver = Some(bitmap.subscribe(chunk as usize));
                    } else if let Some(ClientTaskMessage::UnsubscribeAll) = msg {
                        log::debug!("[Client{}] Received unsubscribe all message", client_id);
                        update_receiver = None;
                    } else if let Some(ClientTaskMessage::SendStats) = msg {
                        log::debug!("[Client{}] Received send stats message", client_id);
                        let stats = MessageMut::create_message(MessageType::Stats, &mut send_data)?;
                        if let MessageMut::Stats(stats) = stats {
                            stats.current_clients = ctx.metrics.clients.load(Ordering::Relaxed);
                        }

                        sender.lock().await.send_binary(&send_data).await?;
                    }
                }
            }
        }
    }

    async fn client_task_receive(
        ctx: &Arc<SharedServerContext>,
        data_type: Data,
        recv_data: &Vec<u8>,
        send_data: &mut Vec<u8>,
        ctm_sender: &mpsc::Sender<ClientTaskMessage>,
    ) -> PResult<()> {
        if !data_type.is_binary() {
            return Ok(());
        }

        let message = Message::from_slice(&recv_data)?;
        if !message.id().is_client_message() {
            return Ok(());
        }

        send_data.clear();

        match message {
            Message::ChunkFullStateRequest(msg) => {
                let full_state =
                    MessageMut::create_message(MessageType::ChunkFullStateResponse, send_data)?;

                if let MessageMut::ChunkFullStateResponse(full_state) = full_state {
                    let bitmap = ctx.bitmap.read().await;
                    full_state.chunk_index = msg.chunk_index;
                    full_state
                        .bitmap
                        .copy_from_slice(bitmap.as_raw_slice(msg.chunk_index as usize));
                }
            }
            Message::ToggleBit(msg) => {
                let idx = msg.index as usize;
                log::debug!("Received toggle bit: {}", idx);
                let addend = ctx.bitmap.read().await.toggle(idx);
                ctx.metrics.inc_checked_bits(addend as i32);
                ctx.metrics.inc_bit_toggles();
            }
            Message::PartialStateSubscription(msg) => {
                ctm_sender
                    .send(ClientTaskMessage::Subscribe {
                        chunk: msg.chunk_index,
                    })
                    .await?;
            }
            Message::PartialStateUnsubscription => {
                ctm_sender.send(ClientTaskMessage::UnsubscribeAll).await?;
            }
            _ => (),
        }

        Ok(())
    }

    async fn try_handle_as_http(
        ctx: &Arc<SharedServerContext>,
        mut server: Server<'_, Compat<TcpStream>>,
    ) -> PResult<()> {
        let mut header_buf = [httparse::EMPTY_HEADER; 32];
        let mut request = httparse::Request::new(&mut header_buf);

        let buffer = server.take_buffer();

        match request.parse(buffer.as_ref()) {
            Ok(httparse::Status::Complete(_)) => (),
            _ => return Err(Box::new(BitmapError::InvalidHttp)),
        };

        let mut stream = server.into_inner();

        if let Some("GET") = request.method {
            if let Some("/metrics") = request.path {
                let metrics = ctx.metrics.to_prometheus();

                let response = format!(
                    "HTTP/1.1 200 OK\r\n\
					Content-Type: text/plain; version=0.0.4\r\n\
					Content-Length: {}\r\n\
					Connection: close\r\n\
					\r\n\
					{}",
                    metrics.len(),
                    metrics
                );

                stream.write_all(response.as_bytes()).await?;
            } else {
                let response = "HTTP/1.1 404 Not Found\r\n\r\nNot found";
                stream.write_all(response.as_bytes()).await?;
            }
        }

        // let response = Self::handle_http_request(request.method, request.path);
        // server.send_response(&response).await?;

        Ok(())
    }

    fn get_ip_from_proxy_headers(
        server: &mut Server<'_, Compat<TcpStream>>,
    ) -> PResult<Option<IpAddr>> {
        let mut header_buf = [httparse::EMPTY_HEADER; 32];
        let mut request = httparse::Request::new(&mut header_buf);

        let buffer = server.take_buffer();

        match request.parse(buffer.as_ref()) {
            Ok(httparse::Status::Complete(_)) => (),
            _ => return Err(Box::new(BitmapError::InvalidHttp)),
        };

        let ip = Self::parse_proxy_headers(request.headers);

        server.set_buffer(buffer);
        Ok(ip)
    }

    fn parse_proxy_headers(headers: &[httparse::Header<'_>]) -> Option<IpAddr> {
        for header in headers {
            let value = if let Ok(value) = std::str::from_utf8(header.value) {
                value
            } else {
                continue;
            };

            if let Some(ip) = Self::try_parse_header(header.name, value) {
                return Some(ip);
            }
        }

        None
    }

    fn try_parse_header(name: &str, value: &str) -> Option<IpAddr> {
        if name.eq_ignore_ascii_case("CF-Connecting-IP") {
            IpAddr::from_str(value.trim()).ok()
        } else if name.eq_ignore_ascii_case("X-Forwarded-For") {
            let ip = value.split(',').next()?;
            let ip = IpAddr::from_str(ip.trim()).ok()?;

            Some(ip)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum BitmapError {
    InvalidHttp,
}

impl std::fmt::Display for BitmapError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            BitmapError::InvalidHttp => write!(f, "Invalid HTTP request"),
        }
    }
}

impl std::error::Error for BitmapError {}

/// Server statistics
#[derive(Serialize, Deserialize, Default)]
struct Metrics {
    #[serde(skip)]
    // Number of clients connected
    clients: AtomicU32,
    // Peak number of clients connected at the same time
    peak_clients: AtomicU32,
    // Number of currently checked bits
    checked_bits: AtomicU32,
    // Number of bit toggles
    bit_toggles: AtomicU64,
}

impl Metrics {
    pub fn save_to_file(&self, path: &str) -> std::io::Result<()> {
        let data = serde_json::to_string(self)?;
        std::fs::write(path, data)?;
        Ok(())
    }

    pub fn load_from_file(path: &str) -> std::io::Result<Self> {
        let data = std::fs::read_to_string(path)?;
        let stats = serde_json::from_str(&data)?;
        Ok(stats)
    }

    pub fn inc_clients(&self) {
        let clients = self.clients.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_clients.fetch_max(clients, Ordering::Relaxed);
    }

    pub fn dec_clients(&self) {
        self.clients.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn set_checked_bits(&self, value: u32) {
        self.checked_bits.store(value, Ordering::Relaxed);
    }

    pub fn inc_checked_bits(&self, amount: i32) {
        self.checked_bits
            .fetch_add(amount as u32, Ordering::Relaxed);
    }

    pub fn inc_bit_toggles(&self) {
        self.bit_toggles.fetch_add(1, Ordering::Relaxed);
    }

    pub fn to_prometheus(&self) -> String {
        format!(
            "# TYPE bitmap_clients gauge\n\
            # HELP bitmap_clients Number of clients connected\n\
            bitmap_clients {}\n\
            # TYPE bitmap_peak_clients counter\n\
            # HELP bitmap_peak_clients Peak number of clients connected at the same time\n\
            bitmap_peak_clients {}\n\
            # TYPE bitmap_checked_bits gauge\n\
            # HELP bitmap_checked_bits Number of currently checked bits\n\
            bitmap_checked_bits {}\n\
            # TYPE bitmap_bit_toggles counter\n\
            # HELP bitmap_bit_toggles Number of bit toggles\n\
            bitmap_bit_toggles {}\n",
            self.clients.load(Ordering::Relaxed),
            self.peak_clients.load(Ordering::Relaxed),
            self.checked_bits.load(Ordering::Relaxed),
            self.bit_toggles.load(Ordering::Relaxed),
        )
    }
}
